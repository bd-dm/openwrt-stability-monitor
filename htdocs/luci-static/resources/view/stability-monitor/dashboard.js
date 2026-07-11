'use strict';
'require view';
'require fs';
'require poll';
'require ui';

function fmtLatency(value) {
	return value == null || !isFinite(value) ? '-' : '%.1f ms'.format(Number(value));
}

function fmtSpeed(value) {
	var bps = Number(value);

	if (!isFinite(bps) || bps <= 0)
		return '-';
	if (bps >= 1000000000)
		return '%.2f Gbit/s'.format(bps / 1000000000);

	return '%.1f Mbit/s'.format(bps / 1000000);
}

function summarizeSpeed(tests) {
	var result = { tests: 0, min: null, max: null, sum: 0 };

	for (var i = 0; i < tests.length; i++) {
		var value;

		if (tests[i].success === false || tests[i].bits_per_second == null)
			continue;
		value = Number(tests[i].bits_per_second);
		if (!isFinite(value))
			continue;
		result.tests++;
		result.sum += value;
		if (result.min == null || value < result.min)
			result.min = value;
		if (result.max == null || value > result.max)
			result.max = value;
	}
	result.avg = result.tests ? result.sum / result.tests : null;
	return result;
}

function fmtTime(timestamp, includeDate) {
	var date = new Date(Number(timestamp) * 1000);

	if (isNaN(date.getTime()))
		return '-';

	return includeDate
		? date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
		: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function statusClass(state) {
	if (state === 'online')
		return 'stability-monitor-online';
	if (state === 'degraded')
		return 'stability-monitor-degraded';

	return 'stability-monitor-offline';
}

function stat(label, value) {
	return E('div', { 'class': 'stability-monitor-stat' }, [
		E('span', { 'class': 'stability-monitor-stat-label' }, label),
		E('strong', {}, value)
	]);
}

function summarize(buckets) {
	var result = {
		probes: 0,
		failures: 0,
		outages: 0,
		latencySum: 0,
		latencyCount: 0,
		minLatency: null,
		maxLatency: null
	};

	for (var i = 0; i < buckets.length; i++) {
		var bucket = buckets[i];
		var successes;

		if (!bucket)
			continue;

		result.probes += Number(bucket.probes || 0);
		result.failures += Number(bucket.failures || 0);
		result.outages += Number(bucket.outages || 0);
		successes = Number(bucket.successes || 0);

		if (bucket.avg_latency_ms != null && successes > 0) {
			result.latencySum += Number(bucket.avg_latency_ms) * successes;
			result.latencyCount += successes;
		}

		if (bucket.min_latency_ms != null && (result.minLatency == null || Number(bucket.min_latency_ms) < result.minLatency))
			result.minLatency = Number(bucket.min_latency_ms);

		if (bucket.max_latency_ms != null && (result.maxLatency == null || Number(bucket.max_latency_ms) > result.maxLatency))
			result.maxLatency = Number(bucket.max_latency_ms);
	}

	result.avgLatency = result.latencyCount ? result.latencySum / result.latencyCount : null;
	return result;
}

function chartPoints(buckets, now, range, slots) {
	var slotSize = range / slots;
	var rangeEnd = now;
	var rangeStart = rangeEnd - range;
	var points = [];

	for (var i = 0; i < slots; i++) {
		points.push({
			start: rangeStart + i * slotSize,
			end: rangeStart + (i + 1) * slotSize,
			probes: 0,
			failures: 0,
			latencySum: 0,
			latencyCount: 0
		});
	}

	for (var j = 0; j < buckets.length; j++) {
		var bucket = buckets[j];
		var timestamp = Number(bucket.start || bucket.end || 0);
		var index = Math.floor((timestamp - rangeStart) / slotSize);
		var successes = Number(bucket.successes || 0);

		if (index < 0 || index >= slots)
			continue;

		points[index].probes += Number(bucket.probes || 0);
		points[index].failures += Number(bucket.failures || 0);

		if (bucket.avg_latency_ms != null && successes > 0) {
			points[index].latencySum += Number(bucket.avg_latency_ms) * successes;
			points[index].latencyCount += successes;
		}
	}

	for (var k = 0; k < points.length; k++) {
		points[k].latency = points[k].latencyCount ? points[k].latencySum / points[k].latencyCount : null;
		points[k].loss = points[k].probes ? points[k].failures * 100 / points[k].probes : 0;
	}

	return points;
}

function latencyColor(value) {
	var ratio, hue;

	if (value < 30)
		return '#149650';
	if (value > 100)
		return '#e67e22';

	ratio = (value - 30) / 70;
	hue = Math.round(132 - ratio * 80);
	return 'hsl(%d,72%%,42%%)'.format(hue);
}

function chart(points, title, includeDate) {
	var latencies = points.filter(function(point) { return point.latency != null; }).map(function(point) { return point.latency; });
	var max = latencies.length ? Math.max.apply(Math, latencies) : 1;
	var bars = points.map(function(point, index) {
		var hasLoss = point.loss > 0;
		var height = 2;
		var color = '#a0a7b2';
		var label = _('No data');

		if (hasLoss) {
			height = point.loss;
			color = '#d43b32';
			label = _('%s — %.1f%% packet loss').format(fmtTime(point.start, includeDate), point.loss);
		}
		else if (point.latency != null) {
			height = max > 0 ? Math.max(8, point.latency / max * 100) : 8;
			color = latencyColor(point.latency);
			label = _('%s — %.1f ms').format(fmtTime(point.start, includeDate), point.latency);
		}
		else {
			label = _('%s — No data').format(fmtTime(point.start, includeDate));
		}

		return E('i', {
			'class': hasLoss ? 'stability-monitor-loss-bar' : '',
			'style': '--bar-height:%.2f%%;--bar-color:%s;--bar-delay:%dms'.format(height, color, index * 12),
			'aria-label': label,
			'data-tooltip': label
		});
	});

	return E('section', { 'class': 'stability-monitor-card stability-monitor-chart-card' }, [
		E('div', { 'class': 'stability-monitor-chart-heading' }, [
			E('h3', {}, title),
			E('span', {}, _('green: <30 ms · yellow: 30–100 ms · orange: >100 ms · red: loss'))
		]),
		E('div', { 'class': 'stability-monitor-chart-plot' }, bars),
		E('div', { 'class': 'stability-monitor-chart-axis' }, [
			E('span', {}, fmtTime(points[0].start, includeDate)),
			E('span', {}, _('now'))
		])
	]);
}

function speedChart(tests, now, interval) {
	var slots = 60;
	var rangeStart = now - interval * slots;
	var visible = [];
	var values;

	for (var i = 0; i < slots; i++)
		visible.push({ start: rangeStart + i * interval, test: null });

	for (var j = 0; j < tests.length; j++) {
		var timestamp = Number(tests[j].start || tests[j].end || 0);
		var index = Math.floor((timestamp - rangeStart) / interval);

		if (index >= 0 && index < slots)
			visible[index].test = tests[j];
	}

	values = visible.filter(function(slot) {
		return slot.test && slot.test.success !== false && slot.test.bits_per_second != null;
	}).map(function(slot) { return Number(slot.test.bits_per_second); });
	var max = values.length ? Math.max.apply(Math, values) : 0;
	var bars = visible.map(function(slot, index) {
		var test = slot.test;
		var failed = test && test.success === false;
		var value = test && test.bits_per_second != null ? Number(test.bits_per_second) : 0;
		var label = !test ? _('%s — No test').format(fmtTime(slot.start, true))
			: failed ? _('%s — Test failed').format(fmtTime(test.end || test.start, true))
				: _('%s — %s').format(fmtTime(test.end || test.start, true), fmtSpeed(value));

		return E('i', {
			'style': '--bar-height:%.2f%%;--bar-color:%s;--bar-delay:%dms'.format(
				failed ? 35 : test && max > 0 ? Math.max(8, value / max * 100) : 2,
				failed ? '#d43b32' : test ? '#3478d4' : '#a0a7b2',
				index * 12
			),
			'aria-label': label,
			'data-tooltip': label
		});
	});

	return E('div', { 'class': 'stability-monitor-speed-chart' }, [
		E('div', { 'class': 'stability-monitor-chart-heading' }, [
			E('h3', {}, _('Speed test history')),
			E('span', {}, _('blue: result · red: failed · gray: no test'))
		]),
		tests.length
			? E('div', { 'class': 'stability-monitor-chart-plot' }, bars)
			: E('div', { 'class': 'stability-monitor-chart-empty' }, _('No speed test results yet.')),
		tests.length ? E('div', { 'class': 'stability-monitor-chart-axis' }, [
			E('span', {}, fmtTime(rangeStart, true)),
			E('span', {}, _('now'))
		]) : ''
	]);
}

return view.extend({
	load: function() {
		return fs.exec_direct('/usr/sbin/stability-monitor-status', [ 'json' ]).then(function(res) {
			return JSON.parse(res || '{}');
		}).catch(function() {
			return { status: { state: 'stopped' }, buckets: [] };
		});
	},

	buildDashboard: function(data, animate) {
		var root = E('div', { 'class': 'stability-monitor-root' + (animate === false ? ' stability-monitor-no-animation' : '') });
		var status = data.status || {};
		var buckets = data.buckets || [];
		var speedTests = data.speed_tests || [];
		var now = Number(status.timestamp || Math.floor(Date.now() / 1000));
		var allTime = status.all_time || summarize(buckets);
		var iperf = status.iperf || {};
		var currentSpeedTests = speedTests.filter(function(test) {
			return (!iperf.server || test.server === iperf.server) && (!iperf.direction || test.direction === iperf.direction);
		});
		var speedAllTime = iperf.all_time || summarizeSpeed(currentSpeedTests);
		var lastSpeed = iperf.last_test;

		if (!lastSpeed)
			for (var i = currentSpeedTests.length - 1; i >= 0; i--)
				if (currentSpeedTests[i].success !== false && currentSpeedTests[i].bits_per_second != null) {
					lastSpeed = currentSpeedTests[i];
					break;
				}
		var style = E('style', {}, [
			'.stability-monitor-root{display:flex;flex-direction:column;gap:14px;margin-bottom:1.5em}',
			'.stability-monitor-actions{display:flex;justify-content:flex-end}',
			'.stability-monitor-card{border:1px solid var(--border-color-medium,#d8d8d8);border-radius:8px;background:var(--background-color-high,#fff);padding:14px;min-width:0;overflow:hidden}',
			'.stability-monitor-status{display:flex;align-items:center;gap:12px}',
			'.stability-monitor-dot{width:13px;height:13px;flex:0 0 auto;border-radius:50%;background:#888;box-shadow:0 0 0 5px rgba(0,0,0,.06)}',
			'.stability-monitor-online .stability-monitor-dot{background:#149650}.stability-monitor-degraded .stability-monitor-dot{background:#c78a05}.stability-monitor-offline .stability-monitor-dot{background:#c3352b}',
			'.stability-monitor-status strong{display:block;font-size:20px;text-transform:capitalize}',
			'.stability-monitor-meta{color:var(--text-color-medium,#666);margin:3px 0 0}',
			'.stability-monitor-charts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}',
			'.stability-monitor-chart-card{padding-bottom:10px;overflow:visible}',
			'.stability-monitor-chart-heading{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:8px}',
			'.stability-monitor-chart-heading h3{margin:0}',
			'.stability-monitor-chart-heading span,.stability-monitor-chart-axis{color:var(--text-color-medium,#666);font-size:11px}',
			'.stability-monitor-chart-plot{position:relative;display:flex;align-items:flex-end;gap:2px;height:105px;padding:7px;background:linear-gradient(180deg,rgba(76,111,255,.06),rgba(76,111,255,.015));border-radius:6px;box-sizing:border-box;overflow:visible}',
			'.stability-monitor-chart-plot:before{content:"";position:absolute;inset:7px;background:linear-gradient(to bottom,transparent calc(50% - 1px),rgba(128,128,128,.18) 50%,transparent calc(50% + 1px)),linear-gradient(to top,rgba(128,128,128,.22) 1px,transparent 1px);pointer-events:none}',
			'.stability-monitor-chart-plot i{position:relative;z-index:1;display:block;flex:1 1 2px;min-width:2px;height:var(--bar-height);background:var(--bar-color);border-radius:2px 2px 0 0;transform-origin:bottom;animation:stability-monitor-rise .42s cubic-bezier(.2,.8,.2,1) both;animation-delay:var(--bar-delay);transition:filter .16s,transform .16s;outline:none}',
			'.stability-monitor-chart-plot i:hover,.stability-monitor-chart-plot i:focus{filter:brightness(1.12);transform:scaleX(1.35) scaleY(1.06);z-index:3}',
			'.stability-monitor-chart-plot i:after{content:attr(data-tooltip);position:absolute;left:50%;bottom:calc(100% + 7px);transform:translateX(-50%);display:none;white-space:nowrap;padding:5px 7px;border-radius:4px;background:#20242b;color:#fff;font-size:11px;font-style:normal;box-shadow:0 2px 8px rgba(0,0,0,.25);pointer-events:none}',
			'.stability-monitor-chart-plot i:hover:after,.stability-monitor-chart-plot i:focus:after{display:block}',
			'.stability-monitor-no-animation .stability-monitor-chart-plot i{animation:none}',
			'.stability-monitor-chart-axis{display:flex;justify-content:space-between;margin-top:4px}',
			'.stability-monitor-speed-chart{margin-top:14px;padding-top:12px;border-top:1px solid var(--border-color-low,#eee)}',
			'.stability-monitor-chart-empty{display:flex;align-items:center;justify-content:center;height:105px;border-radius:6px;background:var(--background-color-low,#f5f6f7);color:var(--text-color-medium,#666)}',
			'.stability-monitor-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}',
			'.stability-monitor-stats-title{margin:0 0 9px;font-size:14px}',
			'.stability-monitor-stat{background:var(--background-color-low,#f5f6f7);border-radius:6px;padding:10px;min-width:0}',
			'.stability-monitor-stat-label{display:block;color:var(--text-color-medium,#666);font-size:11px;margin-bottom:4px}',
			'.stability-monitor-stat strong{display:block;font-size:18px;line-height:1.2;overflow-wrap:anywhere}',
			'@keyframes stability-monitor-rise{from{transform:scaleY(0);opacity:.35}to{transform:scaleY(1);opacity:1}}',
			'@media(max-width:850px){.stability-monitor-charts{grid-template-columns:1fr}}',
			'@media(max-width:600px){.stability-monitor-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.stability-monitor-chart-heading span{display:none}}',
			'@media(prefers-reduced-motion:reduce){.stability-monitor-chart-plot i{animation:none;transition:none}}'
		].join(''));

		root.appendChild(style);
		root.appendChild(E('div', { 'class': 'stability-monitor-actions' }, [
			E('button', { 'class': 'btn cbi-button cbi-button-reset', 'click': this.resetStats.bind(this) }, _('Reset stats'))
		]));
		root.appendChild(E('section', { 'class': 'stability-monitor-card stability-monitor-status ' + statusClass(status.state) }, [
			E('span', { 'class': 'stability-monitor-dot' }),
			E('div', {}, [
				E('strong', {}, status.state || _('stopped')),
				E('p', { 'class': 'stability-monitor-meta' }, _('%s ms now · %s via %s').format(
					status.current_latency_ms == null ? '-' : Number(status.current_latency_ms).toFixed(1),
					status.interface || '-',
					status.device || '-'
				))
			])
		]));
		root.appendChild(E('div', { 'class': 'stability-monitor-charts' }, [
			chart(chartPoints(buckets, now, 3600, 60), _('Ping · last hour'), false),
			chart(chartPoints(buckets, now, 86400, 24), _('Ping · last day'), true)
		]));
		root.appendChild(E('section', { 'class': 'stability-monitor-card' }, [
			E('h3', { 'class': 'stability-monitor-stats-title' }, _('All stored history')),
			E('div', { 'class': 'stability-monitor-stats' }, [
				stat(_('Minimum'), fmtLatency(allTime.min_latency_ms != null ? allTime.min_latency_ms : allTime.minLatency)),
				stat(_('Average'), fmtLatency(allTime.avg_latency_ms != null ? allTime.avg_latency_ms : allTime.avgLatency)),
				stat(_('Maximum'), fmtLatency(allTime.max_latency_ms != null ? allTime.max_latency_ms : allTime.maxLatency)),
				stat(_('Outages'), allTime.outages)
			])
		]));
		root.appendChild(E('section', { 'class': 'stability-monitor-card' }, [
			E('h3', { 'class': 'stability-monitor-stats-title' }, _('iperf3 speed tests')),
			E('div', { 'class': 'stability-monitor-stats' }, [
				stat(_('Latest'), lastSpeed ? fmtSpeed(lastSpeed.bits_per_second) : (iperf.running ? _('Running…') : '-')),
				stat(_('Minimum'), fmtSpeed(speedAllTime.min_bits_per_second != null ? speedAllTime.min_bits_per_second : speedAllTime.min)),
				stat(_('Average'), fmtSpeed(speedAllTime.avg_bits_per_second != null ? speedAllTime.avg_bits_per_second : speedAllTime.avg)),
				stat(_('Maximum'), fmtSpeed(speedAllTime.max_bits_per_second != null ? speedAllTime.max_bits_per_second : speedAllTime.max))
			]),
			E('p', { 'class': 'stability-monitor-meta' }, iperf.enabled
				? _('%d stored tests · %s · server %s').format(Number(speedAllTime.tests || 0), iperf.direction || '-', iperf.server || '-')
				: _('Speed tests are disabled in Settings.')),
			speedChart(currentSpeedTests, now, Math.max(60, Number(iperf.interval || 3600)))
		]));

		return root;
	},

	resetStats: function(ev) {
		var button = ev && ev.currentTarget;

		if (!window.confirm(_('Reset all ping and iperf3 statistics and restart the monitor?')))
			return Promise.resolve();

		if (button)
			button.disabled = true;

		return fs.exec_direct('/usr/sbin/stability-monitor-status', [ 'reset' ]).then(function() {
			ui.addNotification(null, E('p', {}, _('Ping and iperf3 statistics were reset.')), 'info');
			return fs.exec_direct('/usr/sbin/stability-monitor-status', [ 'json' ]);
		}).then(function(res) {
			var current = document.querySelector('.stability-monitor-root');
			var replacement = this.buildDashboard(JSON.parse(res || '{}'));

			if (current && current.parentNode)
				current.parentNode.replaceChild(replacement, current);
		}.bind(this)).catch(function(err) {
			ui.addNotification(null, E('p', {}, _('Failed to reset statistics: %s').format(err && err.message ? err.message : err)), 'danger');

			if (button)
				button.disabled = false;
		});
	},

	render: function(data) {
		poll.add(function() {
			return fs.exec_direct('/usr/sbin/stability-monitor-status', [ 'json' ]).then(function(res) {
				return JSON.parse(res || '{}');
			}).then(function(fresh) {
				var current = document.querySelector('.stability-monitor-root');
				var hovered = current && current.querySelector('.stability-monitor-chart-plot i:hover');

				if (hovered)
					return;

				var replacement = this.buildDashboard(fresh, false);

				if (current && current.parentNode)
					current.parentNode.replaceChild(replacement, current);
			}.bind(this));
		}.bind(this), 5);

		return this.buildDashboard(data);
	}
});
