'use strict';
'require view';
'require fs';
'require poll';

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

function fmtTimestamp(value) {
	var date = new Date(Number(value) * 1000);

	return isNaN(date.getTime()) ? '-' : date.toLocaleString();
}

return view.extend({
	load: function() {
		return fs.exec_direct('/usr/sbin/stability-monitor-status', [ 'json' ]).then(function(res) {
			return JSON.parse(res || '{}');
		}).catch(function() {
			return { outages: [] };
		});
	},

	buildHistory: function(data) {
		var outages = (data.outages || []).slice().reverse();
		var root = E('div', { 'class': 'stability-monitor-history-root' });

		root.appendChild(E('style', {}, [
			'.stability-monitor-history-card{border:1px solid var(--border-color-medium,#d8d8d8);border-radius:8px;background:var(--background-color-high,#fff);padding:14px;overflow-x:auto}',
			'.stability-monitor-history{width:100%;border-collapse:collapse}',
			'.stability-monitor-history th,.stability-monitor-history td{padding:10px;border-bottom:1px solid var(--border-color-low,#eee);text-align:left;white-space:nowrap}',
			'.stability-monitor-history tbody tr:last-child td{border-bottom:0}',
			'.stability-monitor-empty{color:var(--text-color-medium,#666);margin:0}'
		].join('')));
		root.appendChild(E('div', { 'class': 'stability-monitor-history-card' }, outages.length
			? [ E('table', { 'class': 'stability-monitor-history' }, [
				E('thead', {}, E('tr', {}, [
					E('th', {}, _('Start')),
					E('th', {}, _('Recovered')),
					E('th', {}, _('Duration')),
					E('th', {}, _('Interface'))
				])),
				E('tbody', {}, outages.map(function(outage) {
					return E('tr', {}, [
						E('td', {}, fmtTimestamp(outage.start)),
						E('td', {}, fmtTimestamp(outage.end)),
						E('td', {}, fmtDuration(outage.duration)),
						E('td', {}, outage.interface || '-')
					]);
				}))
			]) ]
			: [ E('p', { 'class': 'stability-monitor-empty' }, _('No outage events in stored history.')) ]));

		return root;
	},

	render: function(data) {
		poll.add(function() {
			return fs.exec_direct('/usr/sbin/stability-monitor-status', [ 'json' ]).then(function(res) {
				var current = document.querySelector('.stability-monitor-history-root');
				var replacement = this.buildHistory(JSON.parse(res || '{}'));

				if (current && current.parentNode)
					current.parentNode.replaceChild(replacement, current);
			}.bind(this));
		}.bind(this), 30);

		return this.buildHistory(data);
	}
});
