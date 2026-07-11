'use strict';
'require view';
'require form';
'require tools.widgets as widgets';

return view.extend({
	render: function() {
		var m, s, o;

		m = new form.Map('stability-monitor', _('Stability Monitor'));
		m.description = _('Configure IPv4 connectivity monitoring through one selected OpenWrt network interface.');

		s = m.section(form.NamedSection, 'monitor', 'monitor', _('Monitoring'));
		s.anonymous = true;

		o = s.option(form.Flag, 'enabled', _('Enable monitor'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(widgets.NetworkSelect, 'interface', _('Monitored interface'));
		o.rmempty = false;
		o.nocreate = true;
		o.default = 'wan';

		o = s.option(form.Value, 'targets', _('Ping targets'));
		o.rmempty = false;
		o.default = '1.1.1.1 8.8.8.8';
		o.placeholder = '1.1.1.1 8.8.8.8';
		o.validate = function(section_id, value) {
			var targets = (value || '').trim().split(/\s+/);

			for (var i = 0; i < targets.length; i++)
				if (!/^(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])(\.(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])){3}$/.test(targets[i]))
					return _('Enter one or more IPv4 addresses separated by spaces.');

			return true;
		};

		o = s.option(form.Value, 'interval', _('Probe interval'));
		o.datatype = 'uinteger';
		o.default = '1';
		o.readonly = true;

		o = s.option(form.Value, 'timeout', _('Ping timeout'));
		o.datatype = 'range(1,10)';
		o.default = '1';

		o = s.option(form.Value, 'fail_threshold', _('Failures before outage'));
		o.datatype = 'range(1,60)';
		o.default = '3';

		o = s.option(form.Value, 'recovery_threshold', _('Successes before recovery'));
		o.datatype = 'range(1,60)';
		o.default = '3';

		o = s.option(form.Value, 'retention_days', _('Retention days'));
		o.datatype = 'range(1,365)';
		o.default = '30';

		o = s.option(form.Value, 'storage_path', _('Storage path'));
		o.datatype = 'directory';
		o.default = '/etc/stability-monitor';

		s = m.section(form.NamedSection, 'monitor', 'monitor', _('iperf3 speed tests'));
		s.anonymous = true;
		s.description = _('Run periodic speed tests in the background without interrupting ping monitoring. An iperf3 server must be reachable through the monitored interface.');

		o = s.option(form.Flag, 'iperf_enabled', _('Enable speed tests'));
		o.default = '0';
		o.rmempty = false;

		o = s.option(form.Value, 'iperf_server', _('iperf3 server'));
		o.placeholder = 'iperf.example.net';
		o.rmempty = false;
		o.depends('iperf_enabled', '1');

		o = s.option(form.Value, 'iperf_port', _('Server port'));
		o.datatype = 'port';
		o.default = '5201';
		o.depends('iperf_enabled', '1');

		o = s.option(form.Value, 'iperf_interval', _('Test interval'));
		o.datatype = 'range(60,604800)';
		o.default = '3600';
		o.description = _('Seconds between test starts (minimum 60).');
		o.depends('iperf_enabled', '1');

		o = s.option(form.Value, 'iperf_duration', _('Test duration'));
		o.datatype = 'range(1,300)';
		o.default = '10';
		o.description = _('Duration of each test in seconds.');
		o.depends('iperf_enabled', '1');

		o = s.option(form.Value, 'iperf_parallel', _('Parallel streams'));
		o.datatype = 'range(1,32)';
		o.default = '1';
		o.depends('iperf_enabled', '1');

		o = s.option(form.ListValue, 'iperf_direction', _('Direction'));
		o.value('download', _('Download'));
		o.value('upload', _('Upload'));
		o.default = 'download';
		o.depends('iperf_enabled', '1');

		return m.render();
	}
});
