# 0.0.4

**Minor**

- Fix author email address in `package.json`.
- Remove `tsconfig-paths` from `package.json`.
- Add `.eslintignore` to ignore the `lib` folder.

# 0.0.3

**Minor**

- Refactor templates to pass `sql` property instead of `text` property to
  `QueryInterface#query` method.
- Alias the `get_lock` call so it's easier to obtain the lock query result.
