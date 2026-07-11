include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-stability-monitor
# x-release-please-start-version
PKG_VERSION:=0.3.0
# x-release-please-end
PKG_RELEASE:=1
PKG_LICENSE:=MIT
PKG_MAINTAINER:=OpenWrt Stability Monitor

LUCI_TITLE:=LuCI support for WAN ping stability monitoring
LUCI_DEPENDS:=+luci-base +rpcd +busybox
LUCI_PKGARCH:=all

define Package/$(PKG_NAME)/conffiles
/etc/config/stability-monitor
endef

define Package/$(PKG_NAME)/postinst
#!/bin/sh
[ -n "$$IPKG_INSTROOT" ] || {
	/etc/init.d/stability-monitor enable
	/etc/init.d/stability-monitor start
}
exit 0
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
