/*
 * Simple command line program to extract EXIF data
 */

require('jest-fetch-mock').enableMocks()
const fs = require('fs');

const exif = require("../dist/exif.js");

test('adds 1 + 2 to equal 3', () => {
  expect(1+2).toBe(3);
});

test('extract basic exif data', () => {
  const e = new exif.EXIF("./demo/demo.jpeg");
  expect(e).toEqual(expect.anything());
});

it('can not read non-existant file', async () => {
  expect.assertions(1);
  const e = new exif.EXIF("this/file/is/gone");
  await expect(e.complete).rejects.toThrow(new RangeError("Offset is outside the bounds of the DataView"));
}
);

describe('parsing jpegs', () => {
  beforeEach(() => {
    fetch.resetMocks();
  });

  it('opening malformed jpeg throws', async () => {
    expect.assertions(3);
    fetch.once("nonsense, very much not a jpeg");
    const e = new exif.EXIF("./wibble.jpeg");
    expect(e.complete).rejects.toThrow("file is not a jpeg");

    expect(fetch.mock.calls.length).toEqual(1);
    expect(fetch.mock.calls[0][0]).toEqual("./wibble.jpeg");
  });

  it('extracting manufacturer from jpeg', async () => {
    expect.assertions(3);
    fetch.once(fs.readFileSync(`${__dirname}/test-data/zabriskie.jpeg`));
    const e = new exif.EXIF("./zabriskie.jpeg");
    await e.complete;
    expect(e.parsed.exif_data.Model).toEqual("Canon EOS 100D");

    expect(fetch.mock.calls.length).toEqual(1);
    expect(fetch.mock.calls[0][0]).toEqual("./zabriskie.jpeg");
  });
});
