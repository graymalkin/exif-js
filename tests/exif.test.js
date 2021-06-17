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
  await expect(e.complete).rejects.toEqual(expect.anything());
}
);

// it('gets the camera manufacturer', async () => {
//   const e = new exif.EXIF("./demo/demo.jpeg");
//   await e.complete;
//   const model = e.exif_data.Model;
//   expect(model).toEqual("Canon EOS 100D");
// });

describe('parsing jpegs', () => {
  beforeEach(() => {
    fetch.resetMocks();
  });

  it('opening malformed jpeg throws', async () => {
    fetch.once("nonsense, very much not a jpeg");
    const e = new exif.EXIF("./wibble.jpeg");
    expect(e.complete).resolves.toThrow();

    expect(fetch.mock.calls.length).toEqual(1)
    expect(fetch.mock.calls[0][0]).toEqual("./wibble.jpeg")
  });

  it('extracting manufacturer from jpeg', async () => {
    fetch.once(fs.readFileSync(`${__dirname}/test-data/zabriskie.jpeg`));
    const e = new exif.EXIF("./zabriskie.jpeg");
    await e.complete;
    expect(e.exif_data.Model).toEqual("Canon EOS 100D");

    expect(fetch.mock.calls.length).toEqual(1)
    expect(fetch.mock.calls[0][0]).toEqual("./zabriskie.jpeg")
  });
});
