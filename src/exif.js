import { EXIFParser } from "./exif-parse";

class EXIF {
  src = null;

  // Data fields
  parsed = null;
  complete = null;

  /** 
   *   @param {src} string URL of image to be loaded
   */
  constructor (src) {
    this.src = src;
    this.complete = fetch(src)
      .then((response) => response.arrayBuffer())
      .then((buffer) => this.parsed = new EXIFParser(buffer))
      .then(() => this);
  }

}

export { EXIF }
