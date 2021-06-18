import {ExifTags, TiffTags, GPSTags, IFD1Tags, StringValues} from "./exif-fields.js"

class EXIFParser {
  exif_data = null;
  iptc_data = null;
  xmpd_data = null;

  little_endian = null;

  constructor(data) {
    this.exif_data = this.findEXIFinJPEG(data) || {};
    this.iptc_data = this.findIPTCinJPEG(data) || {};
    // if (EXIF.isXmpEnabled) {
    //   this.xmp_data = this.findXMPinJPEG(data) || {};               
    // }
  }

  /**
   * Checks whether a file starts with the JPEG magic number
   * @param {DataView} dataView 
   * @returns boolean
   */
  isJPEG(dataView) {
    return (dataView.getUint16(0) == 0xFFD8);
  }

  findEXIFinJPEG(file) {
    var dataView = new DataView(file);
    if(!this.isJPEG(dataView)) {
      throw "file is not a jpeg";
    }

    let length = file.byteLength;
    var offset = 2;

    while (offset < length) {
      if (dataView.getUint8(offset) != 0xFF) {
        throw "missing data marker";
      }

      // we could implement handling for other markers here,
      // but we're only looking for 0xFFE1 for EXIF data
      if (dataView.getUint8(offset + 1) == 0xE1) {
        return this.readEXIFData(dataView, offset + 4, dataView.getUint16(offset + 2) - 2);
      } else {
        offset += 2 + dataView.getUint16(offset+2);
      }
    }
  }


  findIPTCinJPEG(file) {
    var dataView = new DataView(file);
    if(!this.isJPEG(dataView)) {
      throw "file is not a jpeg";
    }

    var offset = 2;
    let length = file.byteLength;

    var isFieldSegmentStart = function(dataView, offset){
        return (
            dataView.getUint8(offset) === 0x38 &&
            dataView.getUint8(offset+1) === 0x42 &&
            dataView.getUint8(offset+2) === 0x49 &&
            dataView.getUint8(offset+3) === 0x4D &&
            dataView.getUint8(offset+4) === 0x04 &&
            dataView.getUint8(offset+5) === 0x04
        );
    };

    while (offset < length) {
      if ( isFieldSegmentStart(dataView, offset )){
        // Get the length of the name header (which is padded to an even number of bytes)
        var nameHeaderLength = dataView.getUint8(offset+7);
        if(nameHeaderLength % 2 !== 0) nameHeaderLength += 1;
        // Check for pre photoshop 6 format
        if(nameHeaderLength === 0) {
          // Always 4
          nameHeaderLength = 4;
        }

        var startOffset = offset + 8 + nameHeaderLength;
        var sectionLength = dataView.getUint16(offset + 6 + nameHeaderLength);

        return this.readIPTCData(file, startOffset, sectionLength);
      }
      // Not the marker, continue searching
      offset++;
    }
  }

  IptcFieldMap = {
      0x78 : 'caption',
      0x6E : 'credit',
      0x19 : 'keywords',
      0x37 : 'dateCreated',
      0x50 : 'byline',
      0x55 : 'bylineTitle',
      0x7A : 'captionWriter',
      0x69 : 'headline',
      0x74 : 'copyright',
      0x0F : 'category'
  };

  readIPTCData(file, startOffset, sectionLength){
    var dataView = new DataView(file);
    var data = {};
    var fieldValue, fieldName, dataSize, segmentType, segmentSize;
    var segmentStartPos = startOffset;
    while(segmentStartPos < startOffset+sectionLength) {
      if(dataView.getUint8(segmentStartPos) === 0x1C && 
         dataView.getUint8(segmentStartPos+1) === 0x02) {
        segmentType = dataView.getUint8(segmentStartPos+2);
        if(segmentType in IptcFieldMap) {
          dataSize = dataView.getInt16(segmentStartPos+3);
          segmentSize = dataSize + 5;
          fieldName = IptcFieldMap[segmentType];
          fieldValue = getStringFromDB(dataView, segmentStartPos+5, dataSize);
          // Check if we already stored a value with this name
          if(data.hasOwnProperty(fieldName)) {
            // Value already stored with this name, create multivalue field
            if(data[fieldName] instanceof Array) {
              data[fieldName].push(fieldValue);
            }
            else {
              data[fieldName] = [data[fieldName], fieldValue];
            }
          }
          else {
            data[fieldName] = fieldValue;
          }
        }
      }
      segmentStartPos++;
    }
    return data;
  }


  getEndian(buffer, position) {
    // test for TIFF validity and endianness
    if (buffer.getUint16(position) == 0x4949) {
        this.little_endian = true;
    } else if (buffer.getUint16(position) == 0x4D4D) {
        this.little_endian = false;
    } else {
        throw "Not valid TIFF data! (no 0x4949 or 0x4D4D)";
    }
  }

  getStringFromDB(buffer, start, length) {
    var outstr = "";
    for (var n = start; n < start+length; n++) {
      outstr += String.fromCharCode(buffer.getUint8(n));
    }
    return outstr;
  }

  readTags(file, tiffStart, dirStart, strings) {
    var entries = file.getUint16(dirStart, this.little_endian);
    var tags = {};
    var entryOffset;
    var i;

    for (i=0;i<entries;i++) {
      entryOffset = dirStart + i*12 + 2;
      let tag = strings[file.getUint16(entryOffset, this.little_endian)];
      // if (!tag && debug) console.log("Unknown tag: " + file.getUint16(entryOffset, this.little_endian));
      tags[tag] = this.readTagValue(file, entryOffset, tiffStart);
    }
    return tags;
  }

  readEXIFData(file, start) {
    // check for valid EXIF data
    if (this.getStringFromDB(file, start, 4) != "Exif") {
        throw "image contains no valid Exif data"
    }

    var tags, tag, exifData, gpsData;
    const tiffOffset = start + 6;

    // Set the parser endianness
    this.getEndian(file, tiffOffset);

    if (file.getUint16(tiffOffset+2, this.little_endian) != 0x002A) {
        throw "Not valid TIFF data! (no 0x002A)";
    }

    var firstIFDOffset = file.getUint32(tiffOffset+4, this.little_endian);

    if (firstIFDOffset < 0x00000008) {
      throw "Not valid TIFF data! (First offset less than 8)";
    }

    tags = this.readTags(file, tiffOffset, tiffOffset + firstIFDOffset, TiffTags);

    // EXIF Data
    if (tags.ExifIFDPointer) {
      exifData = this.readTags(file, tiffOffset, tiffOffset + tags.ExifIFDPointer, ExifTags);
      for (tag in exifData) {
        switch (tag) {
          case "LightSource" :
          case "Flash" :
          case "MeteringMode" :
          case "ExposureProgram" :
          case "SensingMethod" :
          case "SceneCaptureType" :
          case "SceneType" :
          case "CustomRendered" :
          case "WhiteBalance" :
          case "GainControl" :
          case "Contrast" :
          case "Saturation" :
          case "Sharpness" :
          case "SubjectDistanceRange" :
          case "FileSource" :
            exifData[tag] = StringValues[tag][exifData[tag]];
            break;

          case "ExifVersion" :
          case "FlashpixVersion" :
            exifData[tag] = String.fromCharCode(exifData[tag][0], exifData[tag][1], exifData[tag][2], exifData[tag][3]);
            break;

          case "ComponentsConfiguration" :
            exifData[tag] =
                StringValues.Components[exifData[tag][0]] +
                StringValues.Components[exifData[tag][1]] +
                StringValues.Components[exifData[tag][2]] +
                StringValues.Components[exifData[tag][3]];
            break;
          }
          tags[tag] = exifData[tag];
        }
      }

      if (tags.GPSInfoIFDPointer) {
        gpsData = this.readTags(file, tiffOffset, tiffOffset + tags.GPSInfoIFDPointer, GPSTags);
        for (tag in gpsData) {
          switch (tag) {
            case "GPSVersionID" :
              gpsData[tag] = gpsData[tag][0] +
                  "." + gpsData[tag][1] +
                  "." + gpsData[tag][2] +
                  "." + gpsData[tag][3];
                break;
          }
          tags[tag] = gpsData[tag];
        }
      }

      // extract thumbnail
      tags['thumbnail'] = this.readThumbnailImage(file, tiffOffset, firstIFDOffset);

      return tags;
  }

  /**
  * Given an IFD (Image File Directory) start offset
  * returns an offset to next IFD or 0 if it's the last IFD.
  */
  getNextIFDOffset(dataView, dirStart){
      //the first 2bytes means the number of directory entries contains in this IFD
      var entries = dataView.getUint16(dirStart, this.little_endian);

      // After last directory entry, there is a 4bytes of data,
      // it means an offset to next IFD.
      // If its value is '0x00000000', it means this is the last IFD and there is no linked IFD.

      // each entry is 12 bytes long
      return dataView.getUint32(dirStart + 2 + entries * 12, this.little_endian); 
  }

  /**
   * Extract thumbnail image from EXIF
   * @param {DataView} dataView buffer
   * @param {int} tiffStart start of TIFF data
   * @param {int} firstIFDOffset IFD offset
   * @returns {blob} Blob containing decompressed thumbnail image
   */
  readThumbnailImage(dataView, tiffStart, firstIFDOffset){
    // get the IFD1 offset
    var IFD1OffsetPointer = this.getNextIFDOffset(dataView, tiffStart+firstIFDOffset);

    if (!IFD1OffsetPointer) {
        return {};
    }
    else if (IFD1OffsetPointer > dataView.byteLength) { // this should not happen
        return {};
    }

    var thumbTags = readTags(dataView, tiffStart, tiffStart + IFD1OffsetPointer, IFD1Tags)

    // EXIF 2.3 specification for JPEG format thumbnail

    // If the value of Compression(0x0103) Tag in IFD1 is '6', thumbnail image format is JPEG.
    // Most of Exif image uses JPEG format for thumbnail. In that case, you can get offset of thumbnail
    // by JpegIFOffset(0x0201) Tag in IFD1, size of thumbnail by JpegIFByteCount(0x0202) Tag.
    // Data format is ordinary JPEG format, starts from 0xFFD8 and ends by 0xFFD9. It seems that
    // JPEG format and 160x120pixels of size are recommended thumbnail format for Exif2.1 or later.
    if (thumbTags['Compression']) {
      switch (thumbTags['Compression']) {
          case 6:
            // console.log('Thumbnail image format is JPEG');
            if (thumbTags.JpegIFOffset && thumbTags.JpegIFByteCount) {
            // extract the thumbnail
            var tOffset = tiffStart + thumbTags.JpegIFOffset;
            var tLength = thumbTags.JpegIFByteCount;
            thumbTags['blob'] = new Blob([new Uint8Array(dataView.buffer, tOffset, tLength)], {
                type: 'image/jpeg'
              });
            }
            break;

        case 1:
            throw "Thumbnail image format is TIFF, which is not implemented.";
            break;
        default:
            throw "Unknown thumbnail image format '%s'", thumbTags['Compression'];
        }
    }
    else if (thumbTags['PhotometricInterpretation'] == 2) {
        throw "Thumbnail image format is RGB, which is not implemented.";
    }
    return thumbTags;
}

  rationalNumber(numerator, denominator) {
    var n = new Number(numerator/denominator);
    n.numerator = numerator;
    n.denominator = denominator;
    return n;
  }

  readTagValue(file, entryOffset, tiffStart) {
    let type = file.getUint16(entryOffset+2, this.little_endian);
    let numValues = file.getUint32(entryOffset+4, this.little_endian);
    let valueOffset = file.getUint32(entryOffset+8, this.little_endian) + tiffStart;
    var offset, vals, n, numerator, denominator;

    switch (type) {
    case 1: // byte, 8-bit unsigned int
    case 7: // undefined, 8-bit byte, value depending on field
      if (numValues == 1) {
        return file.getUint8(entryOffset + 8, this.little_endian);
      } else {
        offset = numValues > 4 ? valueOffset : (entryOffset + 8);
        vals = [];
        for (n=0;n<numValues;n++) {
          vals[n] = file.getUint8(offset + n);
        }
        return vals;
      }

    case 2: // ascii, 8-bit byte
      offset = numValues > 4 ? valueOffset : (entryOffset + 8);
      return this.getStringFromDB(file, offset, numValues-1);

    case 3: // short, 16 bit int
      if (numValues == 1) {
        return file.getUint16(entryOffset + 8, this.little_endian);
      } else {
        offset = numValues > 2 ? valueOffset : (entryOffset + 8);
        vals = [];
        for (n=0;n<numValues;n++) {
          vals[n] = file.getUint16(offset + 2*n, this.little_endian);
        }
        return vals;
      }

    case 4: // long, 32 bit int
      if (numValues == 1) {
        return file.getUint32(entryOffset + 8, this.little_endian);
      } else {
        vals = [];
        for (n=0;n<numValues;n++) {
          vals[n] = file.getUint32(valueOffset + 4*n, this.little_endian);
        }
        return vals;
      }

    case 5:    // rational = two long values, first is numerator, second is denominator
      if (numValues == 1) {
        numerator = file.getUint32(valueOffset, this.little_endian);
        denominator = file.getUint32(valueOffset+4, this.little_endian);
        return this.rationalNumber(numerator, denominator);
      } else {
        vals = [];
        for (n=0;n<numValues;n++) {
          numerator = file.getUint32(valueOffset + 8*n, this.little_endian);
          denominator = file.getUint32(valueOffset+4 + 8*n, this.little_endian);
          vals[n] = this.rationalNumber(numerator / denominator);
        }
        return vals;
      }

    case 9: // slong, 32 bit signed int
      if (numValues == 1) {
        return file.getInt32(entryOffset + 8, this.little_endian);
      } else {
        vals = [];
        for (n=0;n<numValues;n++) {
          vals[n] = file.getInt32(valueOffset + 4*n, this.little_endian);
        }
        return vals;
      }

    case 10: // signed rational, two slongs, first is numerator, second is denominator
      if (numValues == 1) {
        numerator = file.getInt32(valueOffset + 8*n, this.little_endian);
        denominator = file.getInt32(valueOffset+4 + 8*n, this.little_endian);
        return this.rationalNumber(numerator, denominator);
    } else {
        vals = [];
        for (n=0;n<numValues;n++) {
          numerator = file.getInt32(valueOffset + 8*n, this.little_endian);
          denominator = file.getInt32(valueOffset+4 + 8*n, this.little_endian);
          vals[n] = this.rationalNumber(numerator, denominator);
        }
        return vals;
      }
    }
  }
}

export { EXIFParser }
