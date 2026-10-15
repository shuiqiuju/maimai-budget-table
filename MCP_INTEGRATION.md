# MCP 接入说明

## 服务与传输

- 官方 Server：`https://mcp.mcd.cn`
- 传输：Streamable HTTP，原生 Node.js `fetch` 发送 JSON-RPC POST。
- 鉴权：服务端从 `MCD_MCP_TOKEN` 或 `MCD_MCP_TOKEN_FILE` 读取，发送 `Authorization: Bearer …`。
- 流程：`initialize` → `notifications/initialized` → `tools/list` / `tools/call`。
- 支持 JSON / SSE 响应、会话头、协议版本协商、分页工具列表；会话 404 后重新初始化一次。
- 每次请求 25 秒超时、响应 4 MiB 上限。401/429/断流/业务失败提示明确；无无限重试、无模拟成功。
- 不转发重定向，不向其他域名发送 Token。

依据：[麦当劳官方接入指南](https://github.com/M-China/mcd-mcp-server)、[MCP 传输规范](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)。

## 实际使用工具

| Tool | 作用 | 快捷流程的实际参数 |
|---|---|---|
| `query-nearby-stores` | 用城市/地标读取门店，供用户选择 | `searchType: 2, beType: 1, city, keyword` |
| `query-meals` | 读取所选营业门店当时段的到店自取菜单 | `storeCode, orderType: 1, beType: 1` |

参数通过官方 `tools/list` 实测获取。不会读取用户的收藏地址、账户积分、优惠券、历史订单；本服务的调用白名单不包含下单、领券、兑积分等写入工具。

## 真实业务链路

```text
用户输入城市/地标
  → 官方门店查询 → 展示店名/地址/营业状态
  → 用户选择门店 → 官方菜单查询
  → structuredContent.data.categories 与 data.meals 关联
  → 排除套餐、会员附加价、条件促销、未支持的可变规格
  → currentPrice 从元转整数分
  → 展示可计算单品及排除数量 → 用户采用菜单
  → 按预算/人数/主食偏好枚举组合
  → 展示三种取舍 → 复制/下载点餐小票
```

官方菜单的价值是给出**当前门店、当前时段**的餐品和参考价。项目在其上补充预算约束、组合比较、可解释选择和小票导出。演示数据始终标注，不作为真实调用证据。

## 适配边界

1. `data.meals` 是编码到详情的映射，不是数组。快捷适配已按真实结构实现。
2. `currentPrice` 可能带随单购条件，不能盲目取最低价；存在 `withOrder`、`canWithOrder`、`discountType` 的商品一律排除。
3. 为避免未展开规格，饮品和小食只选择明确固定份量的名称。主食需官方单品标签。
4. 页面计算为参考合计，不含券、配送费和套餐优惠；未调用 `calculate-price`，不称“已核价”或“最低应付价”。
5. 菜单内存有效期 15 分钟；超时后阻止生成真实方案，要求重新查询。无需数据库。
6. 未知 schema、缺失单价、无可选主食、网络失败均停止真实配餐并提示；不会切换成演示数据。
7. 手动面板显示官方 schema，允许操作者核对字段与单位，结果仍需遵守单品限制。

## 本地接口（供 Skill 使用）

默认基础地址 `http://127.0.0.1:3210`，仅监听本机、校验 Host/Origin，POST 仅收 JSON。

| 路径 | 方法 | 用途 |
|---|---|---|
| `/api/status` | GET | 凭证配置、真实菜单状态，不返回凭证 |
| `/api/catalog` | GET | 演示菜单 |
| `/api/live/stores` | POST | `{city, keyword}` |
| `/api/live/menu` | POST | `{storeCode}`，须来自最近门店搜索 |
| `/api/live/activate` | POST | `{revision}`，采用最近预览的菜单 |
| `/api/plan` | POST | `{mode,budget,people,preference,requireDrink}` |
| `/api/live/tools` | POST | `{}`，查询允许工具的官方 schema |
| `/api/live/query` | POST | `{name,arguments}`，只读白名单工具 |
| `/api/live/import` | POST | 人工核对字段/分类后采用菜单；详见服务实现 |

这是单用户本地应用，不应将端口转发至公网或多人共用。原始响应不写磁盘；仅输出受控错误，Token 不发送给浏览器。

## 联调情况

2026-10-13 已使用真实凭证完成初始化、工具发现、上海人民广场门店查询和菜单读取。已在实际菜单上验证筛选与预算计算；详见 [验证记录](docs/VERIFICATION.md)。

参赛材料不包含 Token、私人地址、订单信息、账号信息或原始鉴权响应。
