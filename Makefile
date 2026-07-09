include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-wanping
PKG_VERSION:=0.1.0
PKG_RELEASE:=1
PKG_LICENSE:=MIT
PKG_MAINTAINER:=OpenWrt Stability Monitor

LUCI_TITLE:=LuCI support for WAN ping stability monitoring
LUCI_DEPENDS:=+luci-base +rpcd +busybox
LUCI_PKGARCH:=all

include $(TOPDIR)/feeds/luci/luci.mk

define Package/$(PKG_NAME)/conffiles
/etc/config/wanping
endef

# call BuildPackage - OpenWrt buildroot signature
