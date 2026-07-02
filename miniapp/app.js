App({
  onLaunch() {
    // 获取系统信息
    const systemInfo = wx.getSystemInfoSync();
    this.globalData.systemInfo = systemInfo;

    // 检查登录状态
    const token = wx.getStorageSync('token');
    if (token) {
      this.globalData.token = token;
      this.checkLoginStatus();
    }
  },

  globalData: {
    token: '',
    userInfo: null,
    systemInfo: null,
    baseUrl: 'https://3cdigitalretail.cn/api/v1',
  },

  checkLoginStatus() {
    wx.request({
      url: `${this.globalData.baseUrl}/user/profile`,
      header: {
        Authorization: `Bearer ${this.globalData.token}`,
      },
      success: (res) => {
        if (res.data?.data) {
          this.globalData.userInfo = res.data.data;
        }
      },
      fail: () => {
        this.globalData.token = '';
        wx.removeStorageSync('token');
      },
    });
  },
});
