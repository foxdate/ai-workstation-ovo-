document.getElementById('sendBtn').addEventListener('click', function () {
  var status = document.getElementById('status');
  status.textContent = '正在获取页面内容…';
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    var tab = tabs[0];
    if (!tab || !tab.id) {
      status.textContent = '无法获取当前标签页';
      return;
    }
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: function () {
        var title = document.title || '';
        var url = window.location.href || '';
        var body = document.body ? document.body.innerText : '';
        var sel = window.getSelection ? window.getSelection().toString() : '';
        return { title: title, url: url, content: body.substring(0, 50000), selection: sel };
      }
    }, function (results) {
      if (chrome.runtime.lastError) {
        status.textContent = '无法读取页面：' + chrome.runtime.lastError.message;
        return;
      }
      var data = results && results[0] && results[0].result ? results[0].result : { title: tab.title, url: tab.url, content: '', selection: '' };
      data.timestamp = new Date().toISOString();
      var port = '8888';
      fetch('http://127.0.0.1:' + port + '/api/browser-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).then(function (r) {
        if (r.ok) status.textContent = '已推送到OVO';
        else status.textContent = '推送失败 ' + r.status;
      }).catch(function (e) {
        status.textContent = '请确认OVO已启动（端口 ' + port + '）';
      });
    });
  });
});
