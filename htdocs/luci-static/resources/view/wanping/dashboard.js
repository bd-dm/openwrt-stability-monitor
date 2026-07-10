'use strict';
'require view';
'require fs';
'require poll';
'require ui';

function fmtDuration(seconds) {
	seconds = Number(seconds || 0);

	var d = Math.floor(seconds / 86400);
	var h = Math.floor((seconds % 86400) / 3600);
	var m = Math.floor((seconds % 3600) / 60);
	var s = Math.floor(seconds % 60);

	if (d > 0)
		return '%dd %dh'.format(d, h);
	if (h > 0)
		return '%dh %dm'.format(h, m);
	if (m > 0)
		return '%dm %ds'.format(m, s);

	return '%ds'.format(s);
}

function fmtLatency(value) {
	if (value == null || value === 'null')
		return '-';

	return '%.1f ms'.format(Number(value));
}

function pad2(value) {
	value = Number(value || 0);
	return value < 10 ? '0' + value : '' + value;
}

function fmtTimestamp(value) {
	var date, normalized;

	if (value == null || value === '' || value === '-')
		return '-';

	if (typeof value === 'number' || /^[0-9]+$/.test('' + value)) {
		date = new Date(Number(value) * 1000);
	}
	else {
		normalized = ('' + value).replace(/([+-][0-9]{2})([0-9]{2})$/, '$1:$2');
		date = new Date(normalized);
	}

	if (!date || isNaN(date.getTime()))
		return '' + value;

	return '%04d-%s-%s %s:%s:%s'.format(
		date.getFullYear(),
		pad2(date.getMonth() + 1),
		pad2(date.getDate()),
		pad2(date.getHours()),
		pad2(date.getMinutes()),
		pad2(date.getSeconds())
	);
}

function statusClass(state) {
	if (state === 'online')
		return 'wanping-online';
	if (state === 'degraded')
		return 'wanping-degraded';

	return 'wanping-offline';
}

function stat(label, value) {
	return E('div', { 'class': 'wanping-stat' }, [
		E('span', { 'class': 'wanping-stat-label' }, label),
		E('strong', {}, value)
	]);
}

function fmtAxisValue(value, suffix) {
	if (suffix === '%')
		return '%.1f%%'.format(value);
	if (suffix === ' ms')
		return '%.1f ms'.format(value);

	return '%.1f%s'.format(value, suffix);
}

function chart(values, color, suffix) {
	var clean = values.filter(function(v) { return v != null && isFinite(v); });
	var max = Math.max.apply(Math, clean.concat([1]));
	var bars = [];

	for (var i = 0; i < values.length; i++) {
		var value = values[i];
		var height = 2;

		if (value != null && isFinite(value))
			height = Math.max(2, (Number(value) / max) * 100);

		bars.push(E('i', {
			'style': 'height:%.2f%%;background:%s'.format(height, color),
			'title': value == null || !isFinite(value) ? _('No data') : '%.2f%s'.format(Number(value), suffix)
		}));
	}

	return E('div', { 'class': 'wanping-chart' }, [
		E('div', { 'class': 'wanping-chart-wrap' }, [
			E('div', { 'class': 'wanping-chart-yaxis' }, [
				E('span', {}, fmtAxisValue(max, suffix)),
				E('span', {}, fmtAxisValue(max / 2, suffix)),
				E('span', {}, fmtAxisValue(0, suffix))
			]),
			E('div', { 'class': 'wanping-chart-main' }, [
				E('div', { 'class': 'wanping-chart-plot' }, bars.length ? bars : [ E('em', {}, _('No data')) ]),
				E('div', { 'class': 'wanping-chart-xaxis' }, [
					E('span', {}, _('older')),
					E('span', {}, _('now'))
				])
			])
		]),
		E('span', { 'class': 'wanping-chart-peak' }, clean.length ? _('Peak %s%s').format(max.toFixed(1), suffix) : _('No data'))
	]);
}

function summarizeBuckets(buckets, since) {
	var result = {
		probes: 0,
		failures: 0,
		outages: 0,
		downtime: 0,
		latencySum: 0,
		latencyCount: 0,
		minLatency: null,
		maxLatency: null
	};

	for (var i = 0; i < buckets.length; i++) {
		var b = buckets[i];

		if (!b || Number(b.end || b.start || 0) < since)
			continue;

		result.probes += Number(b.probes || 0);
		result.failures += Number(b.failures || 0);
		result.outages += Number(b.outages || 0);
		result.downtime += Number(b.downtime || 0);

		if (b.avg_latency_ms != null) {
			var successes = Number(b.successes || 0);
			result.latencySum += Number(b.avg_latency_ms) * successes;
			result.latencyCount += successes;
		}

		if (b.min_latency_ms != null && (result.minLatency == null || Number(b.min_latency_ms) < result.minLatency))
			result.minLatency = Number(b.min_latency_ms);

		if (b.max_latency_ms != null && (result.maxLatency == null || Number(b.max_latency_ms) > result.maxLatency))
			result.maxLatency = Number(b.max_latency_ms);
	}

	result.loss = result.probes > 0 ? (result.failures * 100) / result.probes : 0;
	result.avgLatency = result.latencyCount > 0 ? result.latencySum / result.latencyCount : null;

	return result;
}

return view.extend({
	load: function() {
		return fs.exec_direct('/usr/sbin/wanping-status', [ 'json' ]).then(function(res) {
			return JSON.parse(res || '{}');
		}).catch(function() {
			return { status: { state: 'stopped' }, buckets: [], outages: [] };
		});
	},

	buildDashboard: function(data) {
		var root = E('div', { 'class': 'wanping-root' });
		var style = E('style', {}, [
			'.wanping-root{display:flex;flex-direction:column;gap:18px}',
			'.wanping-actions{display:flex;justify-content:flex-end;gap:8px}',
			'.wanping-hero{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:16px;align-items:stretch}',
			'.wanping-panel,.wanping-card{border:1px solid var(--border-color-medium,#d8d8d8);border-radius:8px;background:var(--background-color-high,#fff);padding:16px;min-width:0;overflow:hidden}',
			'.wanping-state{display:flex;align-items:center;gap:12px;margin-bottom:14px}',
			'.wanping-dot{width:14px;height:14px;border-radius:50%;background:#888;box-shadow:0 0 0 5px rgba(0,0,0,.06)}',
			'.wanping-online .wanping-dot{background:#149650}.wanping-degraded .wanping-dot{background:#c78a05}.wanping-offline .wanping-dot{background:#c3352b}',
			'.wanping-state strong{font-size:22px;text-transform:capitalize}',
			'.wanping-meta{color:var(--text-color-medium,#666);margin:0}',
			'.wanping-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(145px,100%),1fr));gap:10px;min-width:0}',
			'.wanping-stat{border-top:3px solid #4c6fff;background:var(--background-color-low,#f6f6f6);border-radius:6px;padding:12px;min-height:70px;min-width:0}',
			'.wanping-stat-label{display:block;color:var(--text-color-medium,#666);font-size:12px;margin-bottom:8px}',
			'.wanping-stat strong{display:block;font-size:20px;line-height:1.2;overflow-wrap:anywhere}',
			'.wanping-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}',
			'.wanping-chart-wrap{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px;align-items:stretch}',
			'.wanping-chart-yaxis{display:flex;flex-direction:column;justify-content:space-between;min-width:54px;height:160px;color:var(--text-color-medium,#666);font-size:11px;text-align:right}',
			'.wanping-chart-main{min-width:0}',
			'.wanping-chart-plot{position:relative;display:flex;align-items:flex-end;gap:2px;width:100%;height:160px;padding:10px;background:linear-gradient(180deg,rgba(76,111,255,.08),rgba(76,111,255,.02));border-radius:6px;box-sizing:border-box;overflow:hidden}',
			'.wanping-chart-plot:before{content:"";position:absolute;inset:10px;background:linear-gradient(to bottom,transparent 0,transparent calc(50% - 1px),rgba(128,128,128,.25) 50%,transparent calc(50% + 1px),transparent 100%),linear-gradient(to top,rgba(128,128,128,.28),rgba(128,128,128,.28) 1px,transparent 1px);pointer-events:none}',
			'.wanping-chart-plot i{position:relative;z-index:1;display:block;flex:1 1 2px;min-width:2px;border-radius:2px 2px 0 0;opacity:.9}',
			'.wanping-chart-plot em{align-self:center;margin:auto;color:var(--text-color-medium,#666);font-style:normal}',
			'.wanping-chart-xaxis{display:flex;justify-content:space-between;color:var(--text-color-medium,#666);font-size:11px;margin-top:4px}',
			'.wanping-chart-peak{display:block;color:var(--text-color-medium,#666);font-size:12px;margin-top:8px}',
			'.wanping-history{width:100%;border-collapse:collapse}',
			'.wanping-history th,.wanping-history td{padding:10px;border-bottom:1px solid var(--border-color-low,#eee);text-align:left}',
			'@media(max-width:900px){.wanping-hero,.wanping-grid{grid-template-columns:1fr}}',
			'@media(max-width:520px){.wanping-stats{grid-template-columns:1fr}}'
		].join(''));
		var status = data.status || {};
		var buckets = data.buckets || [];
		var outages = (data.outages || []).slice().reverse();
		var ts = Number(status.timestamp || Math.floor(Date.now() / 1000));
		var today = new Date(ts * 1000);
		today.setHours(0, 0, 0, 0);
		var todaySummary = summarizeBuckets(buckets, Math.floor(today.getTime() / 1000));
		var lastHour = summarizeBuckets(buckets, ts - 3600);
		var last24h = summarizeBuckets(buckets, ts - 86400);
		var last7d = summarizeBuckets(buckets, ts - 604800);
		var last30d = summarizeBuckets(buckets, ts - 2592000);
		var latencyValues = buckets.slice(-120).map(function(b) { return b.avg_latency_ms == null ? null : Number(b.avg_latency_ms); });
		var lossValues = buckets.slice(-120).map(function(b) { return Number(b.loss_percent || 0); });

		root.appendChild(style);
		root.appendChild(E('div', { 'class': 'wanping-actions' }, [
			E('button', {
				'class': 'btn cbi-button cbi-button-reset',
				'click': this.resetStats.bind(this)
			}, _('Reset stats'))
		]));
		root.appendChild(E('div', { 'class': 'wanping-hero' }, [
			E('div', { 'class': 'wanping-panel' }, [
				E('div', { 'class': 'wanping-state ' + statusClass(status.state) }, [
					E('span', { 'class': 'wanping-dot' }),
					E('div', {}, [
						E('strong', {}, status.state || _('stopped')),
						E('p', { 'class': 'wanping-meta' }, _('Interface %s via %s').format(status.interface || '-', status.device || '-'))
					])
				]),
				E('div', { 'class': 'wanping-stats' }, [
					stat(_('Current latency'), fmtLatency(status.current_latency_ms)),
					stat(_('Recent loss'), '%.2f%%'.format(Number(status.recent_loss_percent || 0))),
					stat(_('Outages'), status.outage_count || 0),
					stat(_('Total downtime'), fmtDuration(status.total_downtime))
				])
			]),
			E('div', { 'class': 'wanping-panel' }, [
				E('h3', {}, _('Today')),
				E('div', { 'class': 'wanping-stats' }, [
					stat(_('Average latency'), fmtLatency(todaySummary.avgLatency)),
					stat(_('Packet loss'), '%.2f%%'.format(todaySummary.loss)),
					stat(_('Outages'), todaySummary.outages),
					stat(_('Downtime'), fmtDuration(todaySummary.downtime))
				])
			])
		]));

		root.appendChild(E('div', { 'class': 'wanping-grid' }, [
			E('div', { 'class': 'wanping-card' }, [
				E('h3', {}, _('Latency trend')),
				chart(latencyValues, '#4c6fff', ' ms')
			]),
			E('div', { 'class': 'wanping-card' }, [
				E('h3', {}, _('Packet loss trend')),
				chart(lossValues, '#c3352b', '%')
			])
		]));

		root.appendChild(E('div', { 'class': 'wanping-grid' }, [
			E('div', { 'class': 'wanping-card' }, [
				E('h3', {}, _('Last hour')),
				E('div', { 'class': 'wanping-stats' }, [
					stat(_('Average latency'), fmtLatency(lastHour.avgLatency)),
					stat(_('Minimum latency'), fmtLatency(lastHour.minLatency)),
					stat(_('Maximum latency'), fmtLatency(lastHour.maxLatency)),
					stat(_('Packet loss'), '%.2f%%'.format(lastHour.loss))
				])
			]),
			E('div', { 'class': 'wanping-card' }, [
				E('h3', {}, _('Last outage')),
				status.last_outage ? E('div', { 'class': 'wanping-stats' }, [
					stat(_('Started'), fmtTimestamp(status.last_outage.start || status.last_outage.start_iso)),
					stat(_('Recovered'), fmtTimestamp(status.last_outage.end || status.last_outage.end_iso)),
					stat(_('Duration'), fmtDuration(status.last_outage.duration)),
					stat(_('Longest outage'), fmtDuration(status.longest_outage))
				]) : E('p', { 'class': 'wanping-meta' }, _('No outage has been recorded yet.'))
			])
		]));

		root.appendChild(E('div', { 'class': 'wanping-grid' }, [
			E('div', { 'class': 'wanping-card' }, [
				E('h3', {}, _('Last 24 hours')),
				E('div', { 'class': 'wanping-stats' }, [
					stat(_('Packet loss'), '%.2f%%'.format(last24h.loss)),
					stat(_('Outages'), last24h.outages),
					stat(_('Downtime'), fmtDuration(last24h.downtime)),
					stat(_('Average latency'), fmtLatency(last24h.avgLatency))
				])
			]),
			E('div', { 'class': 'wanping-card' }, [
				E('h3', {}, _('Longer history')),
				E('div', { 'class': 'wanping-stats' }, [
					stat(_('7 day loss'), '%.2f%%'.format(last7d.loss)),
					stat(_('7 day downtime'), fmtDuration(last7d.downtime)),
					stat(_('30 day outages'), last30d.outages),
					stat(_('30 day downtime'), fmtDuration(last30d.downtime))
				])
			])
		]));

		root.appendChild(E('div', { 'class': 'wanping-card' }, [
			E('h3', {}, _('Outage history')),
			outages.length ? E('table', { 'class': 'wanping-history' }, [
				E('tr', {}, [
					E('th', {}, _('Start')),
					E('th', {}, _('End')),
					E('th', {}, _('Duration')),
					E('th', {}, _('Interface'))
				])
			].concat(outages.slice(0, 25).map(function(o) {
					return E('tr', {}, [
						E('td', {}, fmtTimestamp(o.start || o.start_iso)),
						E('td', {}, fmtTimestamp(o.end || o.end_iso)),
						E('td', {}, fmtDuration(o.duration)),
						E('td', {}, o.interface || '-')
					]);
				}))) : E('p', { 'class': 'wanping-meta' }, _('No outage events in retained history.'))
		]));

		return root;
	},

	resetStats: function(ev) {
		var button = ev && ev.currentTarget;

		if (!window.confirm(_('Reset all WAN ping statistics and restart the monitor?')))
			return Promise.resolve();

		if (button)
			button.disabled = true;

		return fs.exec_direct('/usr/sbin/wanping-status', [ 'reset' ]).then(function() {
			ui.addNotification(null, E('p', {}, _('WAN ping statistics were reset.')), 'info');

			return fs.exec_direct('/usr/sbin/wanping-status', [ 'json' ]);
		}).then(function(res) {
			var current = document.querySelector('.wanping-root');
			var replacement = this.buildDashboard(JSON.parse(res || '{}'));

			if (current && current.parentNode)
				current.parentNode.replaceChild(replacement, current);

			if (button)
				button.disabled = false;
		}.bind(this)).catch(function(err) {
			ui.addNotification(null, E('p', {}, _('Failed to reset WAN ping statistics: %s').format(err && err.message ? err.message : err)), 'danger');

			if (button)
				button.disabled = false;
		});
	},

	render: function(data) {
		poll.add(function() {
			return fs.exec_direct('/usr/sbin/wanping-status', [ 'json' ]).then(function(res) {
				return JSON.parse(res || '{}');
			}).then(function(fresh) {
				var current = document.querySelector('.wanping-root');
				var replacement = this.buildDashboard(fresh);

				if (current && current.parentNode)
					current.parentNode.replaceChild(replacement, current);
			}.bind(this));
		}.bind(this), 5);

		return this.buildDashboard(data);
	}
});
