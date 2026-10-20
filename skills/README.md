# 开发环境技能目录

正式默认自定义技能目录为用户数据根目录下的 `skills/`，通常是 `~/.beivymate/skills/`。本仓库目录仅供开发显式设置 `BEIVYMATE_SKILLS_DIR` 时使用，不再是正式默认。

示例结构：

```
skills/
  my_skill/
    SKILL.md
    references/
    templates/
    scripts/
```

`SKILL.md` 须包含 frontmatter 中的 `name`、`description` 以及正文。建议提供独立的 `id`；省略时使用文件夹名（小写字母开头，可用数字、短横线、下划线）。`role` 默认 `common`、`version` 默认 `1`。包中的 `state` 不授予发布资格；复制／导入后首先显示待验证，必须在接收方本机验证并确认发布。资源目录保持原样，不自动改写名称或链接。

内置技能位于 `src/beivymate/builtin/skills/`，在界面只读，可创建自定义副本。技能库由后端扫描，不读取浏览器中旧的示例技能缓存。

展示技能包与可执行技能是两个层面：普通指令包可以展示；实际工作流执行仍要求已注册的 executor 及完整输入输出契约。复制到此目录不会执行 scripts/ 下的代码。

目录是本机应用共享配置。可用 `BEIVYMATE_SKILLS_DIR` 更改启动服务使用的自定义技能目录。

完整约定参见仓库根目录 ARCHITECTURE.md；后续模块核对 IMPLEMENTATION_CHECKLIST.md。
