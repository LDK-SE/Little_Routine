const app = getApp();

Page({
  data: {
    members: [],
    keyword: '',
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: true,
    loading: false,
  },

  onLoad() {
    this.fetchList();
  },

  onPullDownRefresh() {
    this.setData({ page: 1, hasMore: true }, () => {
      this.fetchList();
      wx.stopPullDownRefresh();
    });
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  onSearch() {
    this.setData({ page: 1, members: [], hasMore: true }, () => {
      this.fetchList();
    });
  },

  loadMore() {
    if (this.data.loading || !this.data.hasMore) return;
    this.setData({ page: this.data.page + 1 }, () => {
      this.fetchList(true);
    });
  },

  fetchList(append = false) {
    if (this.data.loading) return;
    this.setData({ loading: true });

    const { keyword, page, pageSize } = this.data;

    wx.request({
      url: `${app.globalData.apiBase}/members`,
      method: 'GET',
      data: {
        keyword: keyword || undefined,
        page,
        pageSize,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      },
      header: {
        'Authorization': `Bearer ${app.globalData.token}`,
      },
      success: (res) => {
        if (res.statusCode === 200) {
          const { items, total, totalPages } = res.data;
          const newList = append
            ? [...this.data.members, ...items]
            : items;

          this.setData({
            members: newList,
            total,
            hasMore: page < totalPages,
          });
        }
      },
      fail: () => {
        wx.showToast({ title: '加载失败', icon: 'none' });
      },
      complete: () => {
        this.setData({ loading: false });
      },
    });
  },

  onTapItem(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/member/detail/detail?id=${id}` });
  },
});
