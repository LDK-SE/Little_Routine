const app = getApp();

Page({
  data: {
    userInfo: null,
  },

  onShow() {
    if (app.globalData.userInfo) {
      this.setData({ userInfo: app.globalData.userInfo });
    }
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },
});
