# 自我拓展 · API 说明

OVO支持通过 **运行 JavaScript 拓展代码** 进行自我拓展，可直接使用 AI 生成的代码扩展界面与能力。

---

## 一、入口

1. **运行拓展代码**：左侧栏「🔧 自我拓展」→ 点击「运行拓展代码」→ 在弹窗中粘贴 AI 生成的代码 → 点击「运行」。
2. **从 AI 回复应用**：当 AI 回复中包含 \`\`\`javascript 或 \`\`\`js 代码块时，该块下方会显示 **「应用为拓展」** 按钮，点击即可运行该段代码。

**注意**：仅运行可信代码，拓展代码拥有当前页面能力，请勿运行来源不明的脚本。

---

## 二、拓展 API（window.ZhiQuanExt）

运行时代码会通过全局对象 `window.ZhiQuanExt`（或参数 `ext`）使用以下 API。

### ext.addPanel(id, name, htmlOrFn)

在左侧栏「自我拓展」下方动态添加一块面板。

- **id**：字符串，面板唯一标识，重复 id 会替换原面板。
- **name**：字符串，面板标题。
- **htmlOrFn**：字符串（HTML）或函数。若为函数，将执行并取其返回值作为 HTML。

示例：

```javascript
(function(ext){
  ext.addPanel('my-panel', '我的面板', '<p>由 AI 生成的拓展内容</p>');
})(window.ZhiQuanExt);
```

### ext.toast(msg)

在页面底部短暂显示一条提示（约 2.5 秒）。

- **msg**：字符串。

```javascript
ext.toast('拓展已加载');
```

### ext.getMessages()

获取当前对话的**只读**消息列表副本，每项为 `{ role, content, speaker? }`。

```javascript
var messages = ext.getMessages();
```

### ext.getState(key) / ext.setState(key, value)

读写拓展的持久化键值（存在 localStorage），用于保存偏好或状态。

- **getState()**：无参数时返回全部键值对象；**getState(key)** 返回该 key 的值。
- **setState(key, value)**：写入 key。

```javascript
ext.setState('count', (ext.getState('count') || 0) + 1);
ext.toast('计数: ' + ext.getState('count'));
```

### ext.runCode(code)

在拓展内再执行一段 JavaScript 字符串（同样可访问 `ext`）。

```javascript
ext.runCode("ext.toast('嵌套执行');");
```

---

## 三、AI 生成代码示例

可让 AI 生成类似下面的代码，再通过「运行拓展代码」或「应用为拓展」执行：

```javascript
(function(ext){
  ext.toast('自我拓展已加载');
  ext.addPanel('hello', 'AI 拓展示例', '<p>这是由 AI 生成的拓展面板，用于扩展OVO能力。</p>');
})(window.ZhiQuanExt);
```

更复杂示例（带状态与交互）：

```javascript
(function(ext){
  var count = ext.getState('clickCount') || 0;
  function update() {
    count++;
    ext.setState('clickCount', count);
    ext.toast('已点击 ' + count + ' 次');
  }
  ext.addPanel('counter', '点击计数', '<p>次数: <span id="ext-count">' + count + '</span></p><button id="ext-count-btn">点我</button>');
  setTimeout(function(){
    var btn = document.getElementById('ext-count-btn');
    var span = document.getElementById('ext-count');
    if (btn) btn.onclick = function(){ update(); if(span) span.textContent = ext.getState('clickCount'); };
  }, 100);
})(window.ZhiQuanExt);
```

---

## 四、与 AI 配合使用

1. 在对话中向 AI 描述你想要的拓展（例如：「在侧栏加一个显示当前时间的面板」）。
2. 让 AI 输出符合上述 API 的 \`\`\`javascript 代码块。
3. 在回复中点击该代码块下的 **「应用为拓展」**，或复制代码到「运行拓展代码」弹窗中运行。

即可用 AI 生成的代码直接扩展OVO，实现自我拓展。
