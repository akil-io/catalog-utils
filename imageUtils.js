const sharp = require('sharp');
const _ = require('lodash');

const toPercent = (c, m, p = 100) => Math.round((c/m)*p)/p * 100;
const fromPercent = (c, m) => Math.round((c/100)*m);
const round = (n, p = 2) => { p = Math.pow(10, p); return Math.round(n*p)/p; }
const percent = (n, p = 2) => round(n * 100, p);

const step = function * step(l, s) { let a = 0, p = 0; d = l/s; for (let i = 0; i < s; i++) { a += d; p = Math.round(a); let t = p - Math.round(i*d); yield t; } }
const stepDelta = (w, h, dx, dy) => { 
    if ((dx === 'auto' || dy === 'auto') && (w != h)) {
        if (dx === 'auto' && dy === 'auto') {
            dx = (w > h) ? step(w, h) : 1;
            dy = (w > h) ? 1 : step(h, w);
        }
        if (dx === 'auto' && dy !== 'auto') {
            dx = (w > h) ? step(w, h) : 1;
        }
        if (dx !== 'auto' && dy === 'auto') {
            dy = (w > h) ? 1 : step(h, w);
        }

    } else {
        if (dx === 'auto') dx = 1;
        if (dy === 'auto') dy = 1;
    } 
    return [dx, dy]; 
};
const nextDelta = d => _.isNumber(d) ? d : (d.next().value || 0);

const parseHexColor = (hex) => {
    hex = hex.slice(1);
    let [red, green, blue] = [
        parseInt(`0x${hex.slice(0,2)}`),
        parseInt(`0x${hex.slice(2,4)}`),
        parseInt(`0x${hex.slice(4,6)}`)
    ];
    return { red, green, blue };
}
const toHex = (v) => {
    let h = v.toString(16);
    if (h.length === 1) return `0${h}`;
    else return h;
}
const sum = (...numbers) => numbers.reduce((a, c) => a+=c, 0);
const avg = (...numbers) => Math.round(sum(...numbers) / numbers.length);
const difference = (a, b) => { 
    let d = []; for (let i in a) { 
        d[i] = Math.abs(a[i] - (_.isArray(b) ? b[i] : b)); 
    } 
    return d; 
}
const deviation = (c) => { let a = avg(...c); return difference(c, a); }
const luminance = (...rgb) => {
    let [R,G,B] = rgb.map(c => {
        c = c/255;
        if (c > 0.03928) return Math.pow((c+0.055)/1.055, 2.4);
        else return c/12.92;
    });

    return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}
const contrast = (l1, l2) => (l1 > l2) ? (l1 + 0.05) / (l2 + 0.05) : (l2 + 0.05) / (l1 + 0.05);


class RawPixel {
    constructor(data = [], coord = {}) {
        this.data = data;
        this.x = coord.x;
        this.y = coord.y;
    }
    toString() {
        return `${this.getHex()} at (${this.x}:${this.y})`;
    }
    toObject() {
        return {
            color: this.getHex(),
            opacity: this.getOpacity(),
            x: this.x,
            y: this.y
        };
    }
    getOpacity() {
        if (this.data.length === 4) {
            return toPercent(this.data[3], 255);
        } else return 1;
    }
    setOpacity(value = 100) {
        if (value && this.data.length === 4) {
            this.data[3] = fromPercent(value, 255);
        }
        return this;
    }
    getColor(withAlpha = true, isArray = false) {
        let c;
        if (isArray) {
            c= [this.data[0], this.data[1], this.data[2]];
            if (withAlpha) c.push(this.getOpacity());
        } else {
            c = {
                red: this.data[0],
                green: this.data[1],
                blue: this.data[2]
            };
            if (withAlpha) c.alpha = this.getOpacity();
        }
        return c;
    }
    setColor({red, green, blue, alpha}) {
        if (_.isFinite(red)) this.data[0] = red;
        if (_.isFinite(green)) this.data[1] = green;
        if (_.isFinite(blue)) this.data[2] = blue;
        this.setOpacity(alpha || 100);
        return this;
    }
    getHex() {
        let c = this.getColor(false);
        return `#${toHex(c.red)}${toHex(c.green)}${toHex(c.blue)}`;
    }
    getRGB() {
        let c = this.getColor(false);
        return `rgb(${c.red}, ${c.green}, ${c.blue})`;
    }
    getRGBA() {
        let c = this.getColor(true);
        return `rgb(${c.red}, ${c.green}, ${c.blue}, ${c.alpha/100})`;
    }
    setHex(value) {
        this.setColor(parseHexColor(value));
        return this;
    }
    isEqual(pixel, withAlpha = false) {
        if (pixel instanceof RawPixel) {
            return this.getHex() === pixel.getHex();
        }
        if (_.isString(pixel)) {
            return this.getHex() === pixel;
        }
        if (_.isPlainObject(pixel)) {
            return this.isNear(pixel, { precision: 100, alpha: withAlpha });
        }
    }
    getDifference(pixel, withAlpha = true) {
        let c1, c2;
        c1 = this.getColor(withAlpha, true);

        if (pixel instanceof RawPixel) {
            c2 = pixel.getColor(withAlpha, true);
        } else {
            if (_.isString(pixel)) {
                c2 = parseHexColor(pixel);
            }
            if (_.isPlainObject(pixel)) {
                c2 = Object.assign({}, {
                    red: 0,
                    green: 0,
                    blue: 0,
                    alpha: 100
                }, pixel);
            }
            c2 = (new RawPixel()).setColor(c2).getColor(withAlpha, true);
        }

        let diff = difference(c1, c2);
        return diff;
    }
    getDiffMax(pixel, withAlpha = false) {
        let diff = this.getDifference(pixel, withAlpha);
        return Math.max(...diff);
    }
    getDiffSum(pixel, withAlpha = false) {
        let diff = this.getDifference(pixel, withAlpha);
        return sum(...diff);
    }
    getDiffAvg(pixel, withAlpha = false) {
        let diff = this.getDifference(pixel, withAlpha);
        return avg(...diff);
    }
    getDeviation() {
        let c = this.getColor(false, true);
        return avg(...deviation(c));
    }
    isNear(pixel, options = {}) {
        let precision = options.precision || 90; //percent
        let deviation = options.deviation || false;
        let method = options.method || 'max';
        let withAlpha = options.alpha || false;

        let diff;
        switch (method) {
            case 'sum':
                diff = this.getDiffSum(pixel, withAlpha); 
                break;
            case 'avg':
                diff = this.getDiffAvg(pixel, withAlpha); 
                break;
            default:
                diff = this.getDiffMax(pixel, withAlpha); 
                break;
        }
        precision = fromPercent(100 - precision, 255);
        if (deviation !== false) {
            return diff <= deviation;
        } else {
            return diff <= precision;
        }
    }
    getLuminance() {
        return percent(luminance(...this.getColor(false, true)));
    }
    getContrast(pixel) {
        let l1, l2;

        l1 = luminance(...this.getColor(false, true));

        if (pixel instanceof RawPixel) {
            l2 = luminance(...pixel.getColor(false, true));
        } else {
            let c;
            if (_.isString(pixel)) {
                c = Object.assign({}, parseHexColor(pixel), { alpha: 100 });
            }
            if (_.isPlainObject(pixel)) {
                c = Object.assign({}, {
                    red: 0,
                    green: 0,
                    blue: 0
                }, pixel);
            }
            c = (new RawPixel()).setColor(c).getColor(false, true);
            l2 = luminance(...c);
        }

        return round(contrast(l1, l2));
    }
    isGray(near = 90) {
        return this.getDeviation() <= fromPercent(100 - near, 50);
    }
    isWhite(near = 100) {
        if (near === 100) return this.isEqual("#ffffff");
        else {
            return this.isGray() && this.isNear("#ffffff", {
                deviation: fromPercent(100 - near, 50)
            });
        }
    }
    isBlack(near = 100) {
        if (near === 100) return this.isEqual("#000000");
        else {
            return this.isGray() && this.isNear("#000000", {
                deviation: fromPercent(100 - near, 50)
            });
        }
    }
}

class RawImage {
    constructor(data, options, offset = {}) {
        this.data = data;
        this.width = options.width;
        this.height = options.height;
        this.channels = options.channels;

        for (let side of ['top','left','right','bottom']) {
            this[side] = offset[side] || 0;
        }

        if ((this.width === undefined) || this.width <= 0) throw Error('Width must be positive');
        if ((this.height === undefined) || this.height <= 0) throw Error('Height must be positive');
        if ((this.channels === undefined) || this.channels < 3 || this.channels > 4) throw Error('Channels must be 3 or 4');
        if (this.top < 0 || this.top >= this.height) throw Error('Offset top out of range');
        if (this.left < 0 || this.left >= this.width) throw Error('Offset left out of range');
        if (this.right < 0 || this.right >= this.width) throw Error('Offset right out of range');
        if (this.bottom < 0 || this.bottom >= this.height) throw Error('Offset bottom out of range');
    }

    async getSharp() {
        let image = new SharpImage();
        await image.load(this.data, {
            raw: {
                width: this.width,
                height: this.height,
                channels: this.channels
            }
        });

        return image;
    }

    static async create(input) {
        let image = await sharp(input);
        await image.metadata();

        const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
        return new RawImage(data, info);
    }

    static commands() {
        return ['stop'].reduce((a, c) => Object.assign(a, {[c]:Symbol(c)}), {});
    }

    count() {
        return this.data.length / this.channels;
    }

    hasAlphaChannel() {
        return (this.channel === 4);
    }

    region({top, left, right, bottom}) {
        return new RawImage(this.data, {
            width: this.width,
            height: this.height,
            channels: this.channels
        }, {
            top, left, right, bottom
        });
    }

    offset(x, y) {
        return (y - 1) * (this.channels * this.width) + (x - 1) * this.channels;
    }

    pixel(x, y) {
        let offset = this.offset(x, y);
        return new RawPixel(
            this.data.subarray(
                offset, 
                offset + this.channels
            ),
            { x, y }
        );
    }

    search(settings, next, complete) {
        let data = [];
        let cmd = RawImage.commands();
        for (let pixel of this.scan(settings)) {
            if (next) {
                let item = next(pixel, cmd);
                if (item === cmd.stop) {
                    break;
                }
                data.push(item);
            } else data.push(pixel);
        }
        return complete ? complete(data) : data;
    }
    searchPair(settings, next, complete) {
        let data = [];
        let cmd = RawImage.commands();
        for (let [p1,p2] of this.scanPair(settings)) {
            if (next) {
                let item = next(p1,p2,cmd);
                if (item === cmd.stop) {
                    break;
                }
                data.push(item);
            } else data.push(pixel);
        }
        return complete ? complete(data) : data;
    }

    * scan(settings) {
        let defaultSettings = {
            xs: 1,
            ys: 1,
            xe: this.width,
            ye: this.height,
            dx: 1,
            dy: 1,
            direction: 'row'
        };
        let {xs,ys,xe,ye,dx,dy,direction} = Object.assign({}, defaultSettings, settings || {});

        switch (direction) {
            case "row":
                //by row
                for (let y = ys; y != (ye + dy); y += dy) {
                    for (let x = xs; x != (xe + dx); x += dx) {
                        let p = this.pixel(x, y);
                        yield p;
                    }
                }
                break;
            case "column":
                //by column
                for (let x = xs; x != (xe + dx); x += dx) {
                    for (let y = ys; y != (ye + dy); y += dy) {
                        let p = this.pixel(x, y);
                        yield p;
                    }
                }
                break;
            case "diagonal":
                //by pixel
                [dx, dy] = stepDelta(this.width, this.height, dx, dy);
                for (
                    let x = xs, y = ys; 
                    (x != (xe + dx)) || (y != (ye + dx)); 
                    x += nextDelta(dx), y += nextDelta(dy)) {
                    let p = this.pixel(x, y);
                    yield p;
                }
                break;
            default:
                return;
        }
    }

    * scanPair(settings) {
        let prev = null;

        for (let pixel of this.scan(settings)) {
            if (!prev) {
                prev = pixel;
                continue;
            } else {
                yield [prev, pixel];
                prev = pixel;
            }
        }
    }

    * row(y, options) {
        const {xs,xe,dx} = _.defaults({}, options, {
            xs: 1,
            xe: this.width,
            dx: 1
        });
        for (let x = xs; x != (xe + dx); x += dx) {
            yield this.pixel(x, y);
        }
    }

    * column(x, options) {
        const {ys,ye,dy} = _.defaults({}, options, {
            ys: 1,
            ye: this.width,
            dy: 1
        });
        for (let y = ys; y != (ye + dy); y += dy) {
            yield this.pixel(x, y);
        }
    }
}

class SharpImage {
    constructor() {
        this.sharp = null;
    }

    async load(input, options) {
        this.input = input;
        this.options = options;
        this.sharp = sharp(this.input, this.options);
        this.meta = await this.sharp.metadata();

        return this;
    }

    async getRawImage() {
        const { data, info } = await this.sharp.raw().toBuffer({ resolveWithObject: true });
        return new RawImage(data, info);
    }

    async saveJpeg(output) {
        let info = await this.sharp.jpeg({
            quality: 100,
            progressive: true
        }).toFile(output);

        return info;
    }

    async savePng(output) {
        let info = await this.sharp.png({
            quality: 100,
            progressive: true
        }).toFile(output);

        return info;
    }
}

module.exports = {
    SharpImage,
    RawImage,
    difference,
    deviation,
    parseHexColor,
    toHex,
    sum,
    avg,
    fromPercent,
    toPercent,
    round,
    percent
};