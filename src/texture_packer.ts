import { LevelData } from "./doomdata";

export function pack_textures(level_data: LevelData) {
    const wall_textures = (() => {
        const s = new Set<string>();
        function add_tex(name: string) {
            if (name === "-") return;
            if (name.startsWith("SW1")) {
                s.add("SW2" + name.substring(3));
            }
            s.add(name);
        }

        for (const sidedef of level_data.sidedefs) {
            add_tex(sidedef.lower_texture);
            add_tex(sidedef.middle_texture);
            add_tex(sidedef.upper_texture);
        }
        return Array.from(s.values());
    })().map(t => ({ name: t, texture: level_data.build_texture_rgba(t, false) }));

    const flat_textures = (() => {
        const s = new Set<string>();
        function add_tex(name: string) {
            if (name.startsWith("NUKAGE")) {
                s.add("NUKAGE1");
                s.add("NUKAGE2");
                s.add("NUKAGE3");
            } else {
                s.add(name);
            }
        }
        for (const sector of level_data.sectors) {
            add_tex(sector.floor_texture);
            add_tex(sector.ceiling_texture);
        }
        return Array.from(s.values());
    })().map(t => ({ name: t, texture: level_data.build_texture_rgba(t, true) }));

    const all_textures = wall_textures.concat(flat_textures);
    all_textures.sort((a, b) => b.texture.height - a.texture.height);

    const atlas_size = 1024;
    const atlas = new Uint32Array(atlas_size * atlas_size);

    function blit(texture: { width: number, height: number, pixels: Uint32Array }, dx: number, dy: number) {
        for (let y = 0; y < texture.height; y++) {
            const yy = y + dy;
            for (let x = 0; x < texture.width; x++) {
                const xx = x + dx;

                atlas[atlas_size * yy + xx] = texture.pixels[y * texture.width + x];
            }
        }
    }

    const slab_info = new Map<string, { ofs_x: number, ofs_y: number, w_recip: number, h_recip: number }>();
    let cur_x = 0;
    let cur_y = 0;
    let tallest = 0;
    for (const texture of all_textures) {
        if (cur_x + texture.texture.width > atlas_size) {
            cur_x = 0;
            cur_y += tallest;
            tallest = 0;
        }

        blit(texture.texture, cur_x, cur_y);
        slab_info.set(texture.name, {
            ofs_x: cur_x / atlas_size,
            ofs_y: cur_y / atlas_size,
            w_recip: texture.texture.width / atlas_size,
            h_recip: texture.texture.height / atlas_size,
        });

        if (texture.texture.height > tallest) tallest = texture.texture.height;
        cur_x += texture.texture.width;
    }

    return { atlas, atlas_size, slab_info };
}