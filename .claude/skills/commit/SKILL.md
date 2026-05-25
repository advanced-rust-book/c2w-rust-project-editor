---
name: commit
description: Commit current changes and push them to the current remote branch. Use this when the user says "commit", "make a commit", "commit this", "commit and push", or invokes /commit.
argument-hint: "[optional commit message]"
---

# Commit and push workflow

When the user asks to commit, always interpret that as:

1. Review the current git state:
   - `git status`
   - `git diff`
   - `git diff --staged`

2. Decide what should be committed:
   - Include only relevant files for the completed task.
   - Do not include secrets, `.env` files, generated junk, logs, or unrelated edits.
   - If unrelated changes exist, leave them unstaged and mention them.

3. Run the appropriate checks before committing:
   - Prefer the smallest relevant test/lint/typecheck command.
   - Use commands documented in `CLAUDE.md`, `package.json`, `pyproject.toml`, `Makefile`, or project docs.
   - If checks fail, stop and explain the failure. Do not commit broken code unless the user explicitly says to commit anyway.

4. Create a commit:
   - Use the user's provided message if supplied.
   - Otherwise write a concise conventional commit message.
   - Prefer: `type(scope): summary`
   - Examples: `fix(auth): handle expired sessions`, `feat(api): add user lookup endpoint`.

5. Push:
   - Push the commit to the current branch.
   - If upstream is missing, set upstream with `git push -u origin HEAD`.
   - After pushing, report the commit hash and branch.

Important: In this project, "commit" means "commit and push" unless the user explicitly says "commit only" or "do not push".
