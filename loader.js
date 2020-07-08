const fs = require('fs-extra');
const path = require('path');
const _ = require('lodash');
const XLSX = require('xlsx');
const glob = require('glob');

const { Stat } = require('./stats');

async function loader(settings, handler) {
	let stats = new Stat(settings.stat);
	await fs.ensureDir(settings.target);
	await fs.ensureDir(path.join(settings.target, '.cache'));
	await fs.ensureDir(path.join(settings.target, '.stat'));
	//START==============================
	
	const cache = async (name, handler) => {
		console.log(`SECTION (cache=on): ${name}`);
		let cacheFile = path.join(settings.target, '.cache', `${settings.name}_${name}.json`);
		try {
			let cachedData = await fs.readJson(cacheFile);
			return cachedData;
		} catch (err) {
			let data = await handler();
			await fs.writeJson(cacheFile, data, {
				spaces: 2
			});
			return data;
		}
	};

	cache.load = async (name) => {
		let cacheFile = path.join(settings.target, '.cache', `${settings.name}_${name}.json`);
		let cachedData = await fs.readJson(cacheFile);
		return cachedData;
	};

	cache.skip = async (name, handler) => {
		console.log(`SECTION (cache=off): ${name}`);
		let cacheFile = path.join(settings.target, '.cache', `${settings.name}_${name}.json`);
		let data = await handler();
		await fs.writeJson(cacheFile, data, {
			spaces: 2
		});
		return data;
	};

	let result = await handler(
		settings.source, 
		settings.target, 
		stats,
		cache
	);

	await fs.writeJson(path.join(settings.target, `${settings.name}_result.json`), result, {
		spaces: 2
	});

	//END=================================
	return stats.getResult();
}

module.exports = function (settings, handler) {
	loader(Object.assign({}, settings, {
		source: path.resolve(settings.source),
		targetRoot: path.resolve(settings.target),
	}), handler)
	.then(stats => fs.writeJson(path.join(path.resolve(settings.target), '.stat', `${settings.name}_stat_${Date.now()}.json`), stats, {
		spaces: 2
	}))
	.catch(err => {
		if (err instanceof Error) console.log(err);
		else console.log(`\nError: ${err}`);
	})
	.finally(() => console.log(`\nComplete.`));
}