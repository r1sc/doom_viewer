const range = (count: number) => [...new Array(count).keys()];

class BinaryReader {
    dataView: DataView;
    text_decoder = new TextDecoder("ascii");
    public offset: number = 0;

    constructor(public data: ArrayBuffer) {
        this.dataView = new DataView(data);
    }

    public readByte() {
        return this.dataView.getUint8(this.offset++);
    }

    public readBytes(count: number) {
        const data = new Uint8Array(this.data.slice(this.offset, this.offset + count));
        this.offset += count;
        return data;
    }

    public read_i16() {
        const result = this.dataView.getInt16(this.offset, true);
        this.offset += 2;
        return result;
    }

    public read_u16() {
        const result = this.dataView.getUint16(this.offset, true);
        this.offset += 2;
        return result;
    }

    public read_i32() {
        const result = this.dataView.getInt32(this.offset, true);
        this.offset += 4;
        return result;
    }

    public read_u32() {
        const result = this.dataView.getUint32(this.offset, true);
        this.offset += 4;
        return result;
    }

    public read_string(len: number) {
        const result = this.text_decoder.decode(new Uint8Array(this.dataView.buffer, this.offset, len));
        this.offset += len;
        return result.split("\0")[0];
    }

    public read_all<T>(reader: (br: BinaryReader, i: number) => T): T[] {
        const result: T[] = [];
        let i = 0;
        while (this.offset < this.data.byteLength) {
            result.push(reader(this, i));
            i++;
        }
        return result;
    }
}

interface Lump {
    filepos: number;
    size: number;
    name: string;
}

class WAD {
    br: BinaryReader;
    public lumps: Lump[] = [];

    constructor(data: ArrayBuffer) {
        this.br = new BinaryReader(data);
        const header = {
            wad_type: this.br.read_string(4),
            num_lumps: this.br.read_i32(),
            dir_offset: this.br.read_i32(),
        };

        this.br.offset = header.dir_offset;
        for (let i = 0; i < header.num_lumps; i++) {
            const lump: Lump = {
                filepos: this.br.read_i32(),
                size: this.br.read_i32(),
                name: this.br.read_string(8),
            };
            this.lumps.push(lump);
        }
    }

    get_data(lump_index: number) {
        const sub_ab = this.br.data.slice(this.lumps[lump_index].filepos, this.lumps[lump_index].filepos + this.lumps[lump_index].size);
        return new BinaryReader(sub_ab);
    }

    get_lump(name: string) {
        name = name.toUpperCase();
        const lump = this.lumps.find(l => l.name === name);
        if (!lump) throw new Error("Failed to find lump " + name);
        const sub_ab = this.br.data.slice(lump.filepos, lump.filepos + lump.size);
        return new BinaryReader(sub_ab);
    }

    get_level_parts(name: string) {
        const marker_index = this.lumps.findIndex((l) => l.name === name);
        if (!marker_index) throw new Error("Could not find marker for level");

        return {
            THINGS: this.get_data(marker_index + 1),
            LINEDEFS: this.get_data(marker_index + 2),
            SIDEDEFS: this.get_data(marker_index + 3),
            VERTEXES: this.get_data(marker_index + 4),
            SEGS: this.get_data(marker_index + 5),
            SSECTORS: this.get_data(marker_index + 6),
            NODES: this.get_data(marker_index + 7),
            SECTORS: this.get_data(marker_index + 8),
            REJECT: this.get_data(marker_index + 9),
            BLOCKMAP: this.get_data(marker_index + 10),
        };
    }
}

export interface Vertex {
    x: number;
    y: number;
}

export interface Sector {
    index: number;
    floor: number;
    ceiling: number;
    floor_texture: string;
    ceiling_texture: string;
    brightness: number;
    special_type: number;
    tag: number;
    sub_sectors: Subsector[];
}

export interface Sidedef {
    texture_offset_x: number;
    texture_offset_y: number;
    upper_texture: string;
    lower_texture: string;
    middle_texture: string;
    sector: Sector;
}

export interface Linedef {
    start: Vertex;
    end: Vertex;
    flags: number;
    special_type: number;
    tag: number;
    front_sidedef: Sidedef;
    back_sidedef: Sidedef | null;
}

export interface Seg {
    start: Vertex;
    end: Vertex;
    angle: number;
    linedef: Linedef;
    direction: number;
    offset: number;
}

export interface Subsector {
    segs: Seg[];
    sector: Sector
}

export interface BBox {
    min: Vertex,
    max: Vertex
}

export interface BSPNode {
    left_plane: BSPPlane,
    right_plane: BSPPlane,
    right_bbox: BBox,
    left_bbox: BBox,
    right_child_index: number,
    left_child_index: number
}

export class BSPPlane {
    A: number;
    B: number;
    D: number;

    constructor(public start: Vertex, public dx: number, public dy: number) {
        // Ax + By + D = 0
        // D = -Ax - By
        this.A = -dy;
        this.B = dx;
        this.D = -this.A * start.x - this.B * start.y;
    }

    get_side(a: Vertex) {
        const distance = this.A * a.x + this.B * a.y + this.D;
        return distance >= 0 ? "inside" : "outside";
    }

    get_line_intersection_unsafe(a: Vertex, b: Vertex): Vertex {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const udenom = this.A * dx + this.B * dy;
        const u = (this.A * a.x + this.B * a.y + this.D) / udenom;
        return { x: a.x - dx * u, y: a.y - dy * u };
    }

    /** Clips vertices in the input list to this plane */
    sutherland_hodgman(input: Vertex[]) {
        const output: Vertex[] = [];

        for (let i = 0; i < input.length; i++) {
            const prev = input[i === 0 ? input.length - 1 : i - 1];
            const current = input[i];

            const current_side = this.get_side(current);
            const prev_side = this.get_side(prev);

            if (current_side === "inside") {
                if (prev_side === "outside") {
                    const intersection = this.get_line_intersection_unsafe(prev, current);
                    output.push(intersection)
                }
                output.push(current);
            } else if (prev_side === "inside") {
                const intersection = this.get_line_intersection_unsafe(prev, current);
                output.push(intersection);
            }
        }

        return output;
    }
}


export async function parse_doom_data(url: string, level: string) {
    const req = await fetch(url);
    const ab = await req.arrayBuffer();

    const wad = new WAD(ab);
    const level_stuff = wad.get_level_parts(level);

    let min_x = Number.MAX_SAFE_INTEGER,
        min_y = Number.MAX_SAFE_INTEGER,
        max_x = Number.MIN_SAFE_INTEGER,
        max_y = Number.MIN_SAFE_INTEGER;

    const vertices = level_stuff.VERTEXES.read_all<Vertex>(br => {
        const vertex = {
            x: br.read_i16(),
            y: br.read_i16(),
        };
        if (vertex.x < min_x) min_x = vertex.x;
        if (vertex.y < min_y) min_y = vertex.y;
        if (vertex.x > max_x) max_x = vertex.x;
        if (vertex.y > max_y) max_y = vertex.y;
        return vertex;
    });

    const sectors = level_stuff.SECTORS.read_all<Sector>((br, i) => {
        return {
            index: i,
            floor: br.read_i16(),
            ceiling: br.read_i16(),
            floor_texture: br.read_string(8),
            ceiling_texture: br.read_string(8),
            brightness: br.read_i16(),
            special_type: br.read_i16(),
            tag: br.read_i16(),
            sub_sectors: [],
        };
    });

    const sidedefs = level_stuff.SIDEDEFS.read_all<Sidedef>(br => {
        const texture_offset_x = br.read_i16();
        const texture_offset_y = br.read_i16();
        const upper_texture = br.read_string(8);
        const lower_texture = br.read_string(8);
        const middle_texture = br.read_string(8);
        const sector_index = br.read_i16();

        return {
            texture_offset_x,
            texture_offset_y,
            upper_texture,
            lower_texture,
            middle_texture,
            sector: sectors[sector_index],
        };
    });

    const linedefs = level_stuff.LINEDEFS.read_all<Linedef>(br => {
        const start = br.read_i16();
        const end = br.read_i16();
        const flags = br.read_i16();
        const special_type = br.read_i16();
        const tag = br.read_i16();
        const front_sidedef_index = br.read_i16();
        const back_sidedef_index = br.read_i16();
        return {
            start: vertices[start],
            end: vertices[end],
            flags,
            special_type,
            tag,
            front_sidedef: sidedefs[front_sidedef_index],
            back_sidedef: back_sidedef_index === -1 ? null : sidedefs[back_sidedef_index],
        };
    });

    const segs = level_stuff.SEGS.read_all<Seg>(br => {
        const start = br.read_i16();
        const end = br.read_i16();
        const angle = br.read_i16();
        const linedef_index = br.read_i16();
        const direction = br.read_i16();
        const offset = br.read_i16();
        return {
            start: vertices[start],
            end: vertices[end],
            angle,
            linedef: linedefs[linedef_index],
            direction,
            offset,
        };
    });

    const subsectors = level_stuff.SSECTORS.read_all<Subsector>(br => {
        const ssector_segs: Seg[] = [];
        const count = br.read_i16();
        const start_index = br.read_i16();

        for (let i = 0; i < count; i++) {
            ssector_segs.push(segs[start_index + i]);
        }

        const front = segs[start_index].direction === 0 ? segs[start_index].linedef.front_sidedef : segs[start_index].linedef.back_sidedef!;
        const ssector = { segs: ssector_segs, sector: front.sector };
        front.sector.sub_sectors.push(ssector);

        const back = segs[start_index].linedef.back_sidedef;
        if (back) back.sector.sub_sectors.push(ssector);

        return ssector;
    });

    const nodes = level_stuff.NODES.read_all<BSPNode>(br => {
        let x = br.read_i16();
        let y = br.read_i16();
        let dx = br.read_i16();
        let dy = br.read_i16();
        let right_bbox: BBox = {
            min: { x: br.read_i16(), y: br.read_i16() },
            max: { x: br.read_i16(), y: br.read_i16() },
        };
        let left_bbox: BBox = {
            min: { x: br.read_i16(), y: br.read_i16() },
            max: { x: br.read_i16(), y: br.read_i16() },
        };
        let right_child_index = br.read_i16();
        let left_child_index = br.read_i16();
        return {
            left_bbox,
            right_bbox,
            left_child_index,
            right_child_index,
            left_plane: new BSPPlane({ x, y }, dx, dy),
            right_plane: new BSPPlane({ x, y }, -dx, -dy),
        };
    });


    function read_texture_lump(br: BinaryReader) {
        const num_textures = br.read_i32();
        const texture_offsets = range(num_textures).map(() => br.read_i32());
        const textures = texture_offsets.map(offset => {
            br.offset = offset;

            const name = br.read_string(8);
            const _masked = br.read_i32();
            const width = br.read_i16();
            const height = br.read_i16();
            const _columdirectory = br.read_i32();
            const patchcount = br.read_i16();

            const patches = range(patchcount).map(() => {
                const originx = br.read_i16();
                const originy = br.read_i16();
                const patch = br.read_i16();
                const _stepdir = br.read_i16();
                const _colormap = br.read_i16();

                return { originx, originy, patch };
            });

            return { name, width, height, patches };
        });

        return textures;
    }

    function load_picture(name: string) {
        const br = wad.get_lump(name);
        const width = br.read_u16();
        const height = br.read_u16();
        const leftoffset = br.read_i16();
        const topoffset = br.read_i16();
        const columnofs = range(width).map(() => br.read_u32());

        const pixels = new Uint8Array(width * height);
        for (let col = 0; col < width; col++) {
            br.offset = columnofs[col];
            while (true) {
                const topdelta = br.readByte();
                if (topdelta === 0xFF)
                    break;
                const length = br.readByte();
                const _unused = br.readByte();
                const data = br.readBytes(length);
                const _unused2 = br.readByte();
                for (let y = 0; y < length; y++) {
                    pixels[width * (y + topdelta) + col] = data[y];
                }
            }
        }
        return { pixels, width, height, leftoffset, topoffset };
    }

    const pnames = (() => {
        const br = wad.get_lump("PNAMES");
        const num_patches = br.read_u32();
        return range(num_patches).map(() => br.read_string(8));
    })();

    const playpal = (() => {
        const br = wad.get_lump("PLAYPAL");
        return range(14).map(() => br.readBytes(768));
    })();

    const colormap = (() => {
        const br = wad.get_lump("COLORMAP");
        return range(34).map(() => br.readBytes(256));
    })();

    const texture1 = read_texture_lump(wad.get_lump("TEXTURE1"));

    function build_wall_texture(name: string) {
        const tex = texture1.find(t => t.name === name)!;
        const texture_pixels = new Uint8Array(tex.width * tex.height);
        for (const p of tex.patches) {
            const patch_name = pnames[p.patch];
            const patch = load_picture(patch_name);
            for (let x = 0; x < patch.width; x++) {
                const xx = x + p.originx;
                if (xx >= tex.width) break;
                for (let y = 0; y < patch.height; y++) {
                    const yy = y + p.originy;
                    if (yy >= tex.height) break;
                    texture_pixels[tex.width * yy + xx] = patch.pixels[y * patch.width + x];
                }
            }
        }
        return { pixels: texture_pixels, width: tex.width, height: tex.height };
    }

    function build_flat(name: string) {
        const br = wad.get_lump(name);
        return { width: 64, height: 64, pixels: br.readBytes(64 * 64) };
    }

    function build_texture_rgba(name: string, is_flat: boolean) {
        const texture = is_flat ? build_flat(name) : build_wall_texture(name);
        const pixels = new Uint32Array(texture.width * texture.height);
        for (let y = 0; y < texture.height; y++) {
            for (let x = 0; x < texture.height; x++) {
                const colormap_index = texture.pixels[y * texture.width + x];
                const palette_index = colormap[0][colormap_index];
                const r = playpal[0][palette_index * 3 + 0];
                const g = playpal[0][palette_index * 3 + 1];
                const b = playpal[0][palette_index * 3 + 2];

                pixels[y * texture.width + x] = (255 << 24) | (b << 16) | (g << 8) | r;
            }
        }
        return { width: texture.width, height: texture.height, pixels };
    }

    return {
        nodes,
        subsectors,
        sectors,
        segs,
        linedefs,
        sidedefs,
        vertices,
        build_wall_texture,
        build_flat,
        build_texture_rgba
    };
};