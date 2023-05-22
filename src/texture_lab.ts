import { parse_doom_data } from "./doomdata";

(async function () {
    const { sidedefs, sectors, build_texture_rgba } = await parse_doom_data(
        "https://raw.githubusercontent.com/mattiasgustavsson/doom-crt/main/DOOM1.WAD",
        "E1M1"
    );

    const textures_in_map = new Set(sidedefs.flatMap(s => [s.lower_texture, s.middle_texture, s.upper_texture]));
    textures_in_map.delete("-");

    sectors.forEach(s => {
        textures_in_map.add(s.ceiling_texture); 
        textures_in_map.add(s.floor_texture); 
        console.log(s.floor_texture);
    });

    const bigdoor1 = build_texture_rgba("FLAT20", true);

    const canvas = document.createElement("canvas");
    document.body.append(canvas);
    const ctx = canvas.getContext("2d")!;

    const imagedata = ctx.getImageData(0, 0, bigdoor1.width, bigdoor1.height);
    const u32ary = new Uint32Array(imagedata.data.buffer);
    u32ary.set(bigdoor1.pixels, 0);


    ctx.putImageData(imagedata, 0, 0);
})();