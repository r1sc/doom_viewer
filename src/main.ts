import { parse_doom_data } from "./doomdata";
import { build_sectors } from "./sector_builder";

(async function () {
    const { nodes, subsectors, sectors } = await parse_doom_data(
        "https://raw.githubusercontent.com/mattiasgustavsson/doom-crt/main/DOOM1.WAD",
        "E1M1"
    );
    //   X  Y  Z     R  G  B   
    const sector_lines = build_sectors(subsectors, nodes);

    const canvas = document.createElement("canvas");
    canvas.width = document.body.clientWidth;
    canvas.height = document.body.clientHeight;
    document.body.append(canvas);
    const ctx = canvas.getContext("2d")!;
    
    const list = document.createElement("select");
    list.multiple = true;
    list.size = 50;
    list.style.position = "absolute";
    list.style.top = "0";
    list.style.left = "0";
    document.body.append(list);

    sectors.forEach(s => {
        const o = document.createElement("option");
        o.text = s.index.toString();
        o.value = s.index.toString();
        list.append(o);
    });

    let x = 1000;
    let y = -1000;
    let scale = 0.5;
    document.onkeydown = e => {
        if(e.key === "ArrowUp") {
            y-=100;
        }
        if(e.key === "ArrowDown") {
            y+=100;
        }
        if(e.key === "ArrowLeft") {
            x-=100;
        }
        if(e.key === "ArrowRight") {
            x+=100;
        }
        if(e.key === "+") {
            scale+=0.1;
        }
        if(e.key === "-") {
            scale-=0.1;
        }
    }

    (function render() {
        ctx.resetTransform();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.translate(-x, -y);
        ctx.scale(scale, scale);

        let i = 0;
        for (const so of list.selectedOptions) {
            const sector_index = parseInt(so.value);
            const lines = sector_lines.get(sector_index)!;
            for (const l of lines) {
                if(l.color === "red") continue;
                ctx.strokeStyle = l.color;
                ctx.beginPath();                
                ctx.moveTo(l.a.x, l.a.y);
                ctx.lineTo(l.b.x, l.b.y);
                ctx.stroke();
                ctx.beginPath();
                ctx.ellipse(l.a.x, l.a.y, 5, 5, 0, 0, 360);
                ctx.ellipse(l.b.x, l.b.y, 5, 5, 0, 0, 360);
                ctx.fill();
            }
        }
        

        requestAnimationFrame(render);
    })();
})();
