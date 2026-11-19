Example only, not real content, not authentic. Sample slot files for `tests/keep/kit.test.js`: the test copies
the empty templates from `site/keep/content/original/` into a temporary folder, lays these files over them and runs
`node tools/keep-content.js check --dir <folder>`. `good/` must pass, `bad/` must fail with the listed errors.
