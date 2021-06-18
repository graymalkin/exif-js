import {ExifTags, TiffTags, GPSTags, IFD1Tags, StringValues} from "./exif-fields.js"

class EXIFParser {
  exif_data = null;
  iptc_data = null;
  xmpd_data = null;

  constructor(data) {
    this.exif_data = this.findEXIFinJPEG(data) || {};
    // this.iptc_data = this.findIPTCinJPEG(data) || {};
    // if (EXIF.isXmpEnabled) {
    //     this.xmp_data = findXMPinJPEG(data); || {};               
    // }
  }

  findEXIFinJPEG(file) {
    var dataView = new DataView(file);

    // Check JPEG magic number (0xFF 0xD8)
    if ((dataView.getUint8(0) != 0xFF) || (dataView.getUint8(1) != 0xD8)) {
      throw "file is not a jpeg";
    }

    let length = file.byteLength;
    let offset = 2;
    var marker;

    while (offset < length) {
      if (dataView.getUint8(offset) != 0xFF) {
        throw "missing data marker";
      }

      marker = dataView.getUint8(offset + 1);

      // we could implement handling for other markers here,
      // but we're only looking for 0xFFE1 for EXIF data
      if (marker == 0xE1) {
        return this.readEXIFData(dataView, offset + 4, dataView.getUint16(offset + 2) - 2);
      } else {
        offset += 2 + dataView.getUint16(offset+2);
      }
    }
  }


  getStringFromDB(buffer, start, length) {
    var outstr = "";
    for (var n = start; n < start+length; n++) {
      outstr += String.fromCharCode(buffer.getUint8(n));
    }
    return outstr;
  }

  readTags(file, tiffStart, dirStart, strings, bigEnd) {
    var entries = file.getUint16(dirStart, !bigEnd);
    var tags = {};
    var entryOffset;
    var i;

    for (i=0;i<entries;i++) {
      entryOffset = dirStart + i*12 + 2;
      let tag = strings[file.getUint16(entryOffset, !bigEnd)];
      // if (!tag && debug) console.log("Unknown tag: " + file.getUint16(entryOffset, !bigEnd));
      tags[tag] = this.readTagValue(file, entryOffset, tiffStart, dirStart, bigEnd);
    }
    return tags;
  }

  readEXIFData(file, start) {
    // check for valid EXIF data
    if (this.getStringFromDB(file, start, 4) != "Exif") {
        return false;
    }

    var bigEnd, tags, tag, exifData, gpsData;
    const tiffOffset = start + 6;

    // test for TIFF validity and endianness
    if (file.getUint16(tiffOffset) == 0x4949) {
        bigEnd = false;
    } else if (file.getUint16(tiffOffset) == 0x4D4D) {
        bigEnd = true;
    } else {
        throw "Not valid TIFF data! (no 0x4949 or 0x4D4D)";
    }

    if (file.getUint16(tiffOffset+2, !bigEnd) != 0x002A) {
        throw "Not valid TIFF data! (no 0x002A)";
    }

    var firstIFDOffset = file.getUint32(tiffOffset+4, !bigEnd);

    if (firstIFDOffset < 0x00000008) {
      throw "Not valid TIFF data! (First offset less than 8)";
    }

    tags = this.readTags(file, tiffOffset, tiffOffset + firstIFDOffset, TiffTags, bigEnd);

    if (tags.ExifIFDPointer) {
      exifData = this.readTags(file, tiffOffset, tiffOffset + tags.ExifIFDPointer, ExifTags, bigEnd);
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
        gpsData = this.readTags(file, tiffOffset, tiffOffset + tags.GPSInfoIFDPointer, GPSTags, bigEnd);
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
      // tags['thumbnail'] = readThumbnailImage(file, tiffOffset, firstIFDOffset, bigEnd);

      return tags;
  }

  readTagValue(file, entryOffset, tiffStart, dirStart, bigEnd) {
    var type = file.getUint16(entryOffset+2, !bigEnd),
        numValues = file.getUint32(entryOffset+4, !bigEnd),
        valueOffset = file.getUint32(entryOffset+8, !bigEnd) + tiffStart,
        offset,
        vals, val, n,
        numerator, denominator;

    switch (type) {
        case 1: // byte, 8-bit unsigned int
        case 7: // undefined, 8-bit byte, value depending on field
            if (numValues == 1) {
                return file.getUint8(entryOffset + 8, !bigEnd);
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
                return file.getUint16(entryOffset + 8, !bigEnd);
            } else {
                offset = numValues > 2 ? valueOffset : (entryOffset + 8);
                vals = [];
                for (n=0;n<numValues;n++) {
                    vals[n] = file.getUint16(offset + 2*n, !bigEnd);
                }
                return vals;
            }

        case 4: // long, 32 bit int
            if (numValues == 1) {
                return file.getUint32(entryOffset + 8, !bigEnd);
            } else {
                vals = [];
                for (n=0;n<numValues;n++) {
                    vals[n] = file.getUint32(valueOffset + 4*n, !bigEnd);
                }
                return vals;
            }

        case 5:    // rational = two long values, first is numerator, second is denominator
            if (numValues == 1) {
                numerator = file.getUint32(valueOffset, !bigEnd);
                denominator = file.getUint32(valueOffset+4, !bigEnd);
                val = new Number(numerator / denominator);
                val.numerator = numerator;
                val.denominator = denominator;
                return val;
            } else {
                vals = [];
                for (n=0;n<numValues;n++) {
                    numerator = file.getUint32(valueOffset + 8*n, !bigEnd);
                    denominator = file.getUint32(valueOffset+4 + 8*n, !bigEnd);
                    vals[n] = new Number(numerator / denominator);
                    vals[n].numerator = numerator;
                    vals[n].denominator = denominator;
                }
                return vals;
            }

        case 9: // slong, 32 bit signed int
            if (numValues == 1) {
                return file.getInt32(entryOffset + 8, !bigEnd);
            } else {
                vals = [];
                for (n=0;n<numValues;n++) {
                    vals[n] = file.getInt32(valueOffset + 4*n, !bigEnd);
                }
                return vals;
            }

        case 10: // signed rational, two slongs, first is numerator, second is denominator
            if (numValues == 1) {
                return file.getInt32(valueOffset, !bigEnd) / file.getInt32(valueOffset+4, !bigEnd);
            } else {
                vals = [];
                for (n=0;n<numValues;n++) {
                    vals[n] = file.getInt32(valueOffset + 8*n, !bigEnd) / file.getInt32(valueOffset+4 + 8*n, !bigEnd);
                }
                return vals;
            }
    }
  }
}

export { EXIFParser }
