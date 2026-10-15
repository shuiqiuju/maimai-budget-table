# GitHub 报名草稿

作品仓库：https://github.com/shuiqiuju/maimai-budget-table

尚未提交比赛报名。提交前先检查当前官方规则是否有更新。

建议仓库名：`maimai-budget-table`

建议标题：麦麦预算配餐台：用真实门店菜单，把预算算成一顿饭

Issue 正文：

```text
〖参赛申请〗
项目名称：麦麦预算配餐台
项目地址：https://github.com/shuiqiuju/maimai-budget-table
项目简介：基于麦当劳 MCP 的本地预算配餐应用和 Skill。通过 HTTP 直连官方接口查询门店与当时段菜单，保守排除套餐、会员附加价及未支持规格，再按预算、人数和主食偏好给出最多三种可解释搭配，支持小票复制与下载。含明确标识的离线演示模式，不自动下单。
```

发布清单：

- 根目录保留 README.md、CONTEST_DECLARATION.md、MCP_INTEGRATION.md、mcp-config.example.json 与源码。
- CONTEST_DECLARATION.md 使用官方原文件，不改文件名、不改正文。
- 公开前再次执行测试并检查凭证未进入仓库历史和发布包。
- `.env`、`local/`、`artifacts/` 均不发布。
- Skill 入口为 `skills/maimai-budget/SKILL.md`，无需声称使用过 WorkBuddy。
- 按当前官方格式提交 Issue，等待机器人返回报名结果。
- 收到报名失败说明时修复对应问题，不把“提交成功”当作“报名成功”。

官方入口：https://github.com/M-China/mcd-developer-innovation-challenge
