'use strict';
'require view';
'require form';
'require tools.widgets as widgets';

return view.extend({
	render: function() {
		var m, s, o;

		m = new form.Map('wanping', _('WAN Ping Monitor'));
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
		o.default = '/etc/wanping';

		return m.render();
	}
});
