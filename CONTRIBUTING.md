# 参与贡献

不会代码也能贡献：文档、翻译、设计、报 bug、分享人格包，同样上榜（all-contributors 口径）。

## 流程

Issue → 分支 → PR → CI。Issue/PR 用英文（沿用上游社区约定）。

## 验证基线（PR 必绿）

```bash
npm run verify
```

= 第三方许可清单 + typecheck 零错误 + 依赖边界 gate + 测试 + build。

## 项目特有约定

读 [AGENTS.md](AGENTS.md)：包边界、双写契约、五层预算、订阅制事件、人格包纯数据。只写项目特有且容易搞错的约定，通用礼仪不重复。

## 品味判断

评估驱动：改运行时先跑 [docs/EVAL.md](docs/EVAL.md) 的感情四支柱场景。green CI ≠ 真机正确，原生能力真机验证。