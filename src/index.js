import { EXIFTags } from "./exif-fields";

function component() {
  const element = document.createElement("div");
  const tag9k = EXIFTags[0x9000];
  element.innerHTML = `EXIF Tag 0x9000 = '${tag9k}'`;
  // element.innerHTML = "Hello, world!";
  return element;
}

document.body.appendChild(component());
