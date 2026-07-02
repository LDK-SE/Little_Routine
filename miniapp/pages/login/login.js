const app = getApp();

Page({
  data: {
    phone: '',
    password: '',
    loading: false,
  },

  onPhoneInput(e) {
    this.setData({ phone: e.detail.value });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value });
  },

  handleLogin() {
    const { phone, password } = this.data;

    if (!phone || phone.length !== 11) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }

    if (!password) {
      wx.showToast({ title: '请输入密码', icon: 'none' });
      return;
    }

    this.setData({ loading: true });

    wx.request({
      url: `${app.globalData.baseUrl}/auth/login`,
      method: 'POST',
      data: { phone, password },
      success: (res) => {
        if (res.data?.code === 200 && res.data?.data?.accessToken) {
          const token = res.data.data.accessToken;
          wx.setStorageSync('token', token);
          app.globalData.token = token;
          app.globalData.userInfo = res.data.data.user;
          wx.showToast({ title: '登录成功', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 1500);
        } else {
          wx.showToast({
            title: res.data?.message || '登录失败',
            icon: 'none',
          });
        }
      },
      fail: () => {
        wx.showToast({ title: '网络错误，请稍后再试', icon: 'none' });
      },
      complete: () => {
        this.setData({ loading: false });
      },
    });
  },
});
