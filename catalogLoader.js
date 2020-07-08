const fs = require('fs-extra');
const path = require('path');
const _ = require('lodash');
const XLSX = require('xlsx');
const glob = require('glob');

const { 
	SharpImage,
	difference,
	deviation,
	sum,
	avg
} = require("./imageUtils");

_.templateSettings.interpolate = /{{([\s\S]+?)}}/g;

String.prototype.replaceAll = function(search, replacement) {
	let target = this;
	if (search.constructor.name === 'Array') {
		return search.reduce((a, c) => a.split(c).join(replacement), target);
	} else {
    	return target.split(search).join(replacement);
	}
};

const combineSet = (a, b) => {
	let r = new Set([...a, ...b]);
	return [...r];
};

class Catalog {
	constructor(root, settings, stat) {
		this.root = root;
		this.id = settings.id;
		this.name = settings.name;
		this.stat = stat;
		this.meta = settings.meta;
		this.sources = settings.sources;

		this.data = {};

		this.loaders = {
			json: 'loadJson',
			xlsx: 'loadXlsx',
			jsonFiles: 'loadJsonFiles'
		};
	}

	glob(pattern) {
		return new Promise((resolve, reject) => {
	    	glob(pattern, (err, files) => {
	    		if (err) resolve([]);
	    		else resolve(files);
	    	});
		});
	}

	addItemData(id, item) {
		if (!this.data[id]) this.data[id] = {};
		this.data[id] = _.merge({}, this.data[id], item || {});
	}

	async dump(to) {
		await fs.writeJson(to, this.data, {
			spaces: 2
		});
	}

	async load() {
		for (let sourceName in this.sources) {
			let source = this.sources[sourceName];
			let idKey = source.idKey;

			for await(let item of this.loadSource(sourceName, source)) {
				let ID = _.get(item, idKey);
				if (ID) {
					if (source["updateOnly"] && !this.data[ID]) continue;

					this.stat.add("items", ID);
					Object.keys(item).map(key => this.stat.add("selFields", key));
					this.addItemData(_.get(item, idKey), item);
				} else this.stat.add('noID');
			}
		}
		return this;
	}

	async * loadSource(name, source) {
		let idKey = source.idKey;
		if (!this.loaders[source.type]) return;

		let index = 0;
		for await (let item of this[this.loaders[source.type]](source.from)) {
			let itemDir = item["$dir"] ? item["$dir"] : path.join(this.root, path.dirname(source.from));

			Object.keys(item).map(key => this.stat.add("allFields", key));

			let ID = _.get(item, idKey);
			item = _.pick(item, combineSet(source.fields, [idKey]));
			console.log(`${this.id} > ${name} > ${ID}`);

			//load searched field
			let searchData = await this.search(source["search"], itemDir, item);
			item = _.merge(item, searchData);

			//rename fields
			item = this.makeRenames(item, source.rename);

			yield item;
			index++;
		}
	}

	makeRenames(item, renameFields) {
		if (!renameFields) return item;
		let result = {};
		for (let key in item) {
			if (renameFields[key]) {
				result[renameFields[key]] = item[key];
			} else {
				result[key] = item[key];
			}
		}
		return result;
	}

	async search(fields, itemDir, item) {
		if (!fields) return {};

		let result = {};
		for (let searchField in fields) {
			let searchItem = fields[searchField];
			switch (searchItem.type) {
				case "files":
					result[searchField] = await this.searchFiles(itemDir, searchItem.from, item);
					break;
				case "image":
					result[searchField] = await this.loadImage(itemDir, searchItem.from, item);
					break;
				case "images":
					result[searchField] = await this.searchImages(itemDir, searchItem.from, item);
					break;
				default:
					break;
			}
		}

		return result;
	}

	async loadImage(dir, from, item) {
		try {
			let source = path.join(dir, from);
			source = _.template(source)(item);

			let image = new SharpImage();
			await image.load(source);
			let filePath = path.relative(dir, source);
			return Object.assign({}, _.pick(image.meta, [
				"format", "width", "height", "space", "channels"
			]), {
				path: filePath,
				name: path.basename(filePath)
			});
		} catch (err) {
			return null;
		}
	}

	async searchImages(dir, from, item = {}) {
		let globPath = path.join(dir, from);
		globPath = _.template(globPath)(item);
		let files = await this.glob(globPath);
		let result = [];
		for (let file of files) {
			let filePath = path.relative(dir, file);
			let image = await this.loadImage(dir, filePath);
			if (image) result.push(image);
		}
		return result;
	}

	async searchFiles(dir, from, item = {}) {
		let globPath = path.join(dir, from);
		globPath = _.template(globPath)(item);
		let files = await this.glob(globPath);
		let result = [];
		for (let file of files) {
			let filePath = path.relative(dir, file);
			result.push(filePath);
		}
		return result;
	}

	async * loadJsonFiles(from) {
		let files = await this.searchFiles(this.root, from);
		if (!files.length) return;

		for (let fileItem of files) {
			let filePath = path.join(this.root, fileItem);
			let data = await fs.readJson(fileItem);
			data["$dir"] = path.dirname(filePath);
			yield data;
		}
	}

	async * loadJson(from) {
		let data = await fs.readJson(from);
		if (!data.length) return;

		for (let index in data) {
			let item = data[index];
			yield item;
		}
	}

	async * loadXlsx(from) {
		let wb = XLSX.readFile(from);
		let data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

		if (data.length === 0) return;
		for (let index in data) {
			let item = data[index];
			yield item;
		}
	}
}

module.exports = {
	Catalog
};