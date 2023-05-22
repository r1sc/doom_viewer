import { parse_doom_data } from "./doomdata";
import { pack_textures } from "./texture_packer";

(async function () {
    const level_data = await parse_doom_data(
        "https://raw.githubusercontent.com/mattiasgustavsson/doom-crt/main/DOOM1.WAD",
        "E1M1"
    );
   
    const packed_textures = pack_textures(level_data);

    const canvas = document.createElement("canvas");
    canvas.width = packed_textures.atlas_size;
    canvas.height = packed_textures.atlas_size;
    document.body.append(canvas);
    const ctx = canvas.getContext("2d")!;

    const imagedata = ctx.getImageData(0, 0, packed_textures.atlas_size, packed_textures.atlas_size);
    const u32ary = new Uint32Array(imagedata.data.buffer);
    u32ary.set(packed_textures.atlas, 0);
    ctx.putImageData(imagedata, 0, 0);

})();