/*
 * Simple command line program to extract EXIF data
 */

// import { EXIF } from '../dist/exif.js';
const exif = require("../dist/exif.js");

test('adds 1 + 2 to equal 3', () => {
  expect(1+2).toBe(3);
});

test('extract basic exif data', () => {
  const e = new exif.EXIF("./demo/demo.jpeg");
  expect(e).toEqual(expect.anything());
});
