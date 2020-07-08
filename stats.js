const _ = require('lodash');

class Stat {
	constructor(items) {
		this.config = items;
		this.data = {};
		this.handler = {};
		this.output = {};

		for (let field in items) {
			let statConfig = items[field];
			if (!_.isArray(items[field])) {
				statConfig = [statConfig];
			}
			this.data[field] = {};
			this.handler[field] = [];
			this.output[field] = {};
			for (let statName of statConfig) {
				let statItem = this[`__stat${statName}`](field);
				this.data[field][statName] = statItem.init(field);
				this.handler[field].push((value => {
					let newValue = statItem.handle(this.data[field][statName], value);
					this.data[field][statName] = newValue;
				}));
				if (statItem["complete"]) {
					this.output[field][statName] = () => {
						return statItem.complete(this.data[field][statName]);
					};
				} else {
					this.output[field][statName] = () => {
						return this.data[field][statName];
					};
				}
			}
		}
	}

	__statCount(field) { return {
		init: () => 0,
		handle: (data) => data + 1
	}}
	__statSum(field) { return {
		init: () => 0,
		handle: (data, value = 0) => data += value
	}}
	__statRange(field) { return {
		init: () => [Infinity, 0],
		handle: (data, value) => [Math.min(data[0], value), Math.max(data[0], value)]
	}}
	__statUnique(field) { return {
		init: () => new Set(),
		handle: (data, value) => data.add(value),
		complete: (data) => [...data]
	}}
	__statSumMap(field) { return {
		init: () => new Map(),
		handle: (data, value) => data.has(value) ? data.set(value, data.get(value) + 1) : data.set(value, 1),
		complete: (data) => [...data.entries()].reduce((a,c) => Object.assign(a, {[c[0]]:c[1]}), {})
	}}

	add(field, value) {
		if (!field || !this.handler[field]) return;
		return this.handler[field].map(handle => handle(value));
	}

	getResult() {
		let result = {};
		for (let field in this.data) {
			result[field] = {};
			for (let statName in this.data[field]) {
				result[field][statName] = this.output[field][statName]();
			}
			if (result[field]['Count'] && result[field]['Unique']) {
				result[field]['Count'] = result[field]['Unique'].length;
				result[field]['Unique'] = undefined;
			}
		}
		return result;
	}
}

module.exports = {
	Stat
};