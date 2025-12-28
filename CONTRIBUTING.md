# Contributing Guide – carto

Thank you for your interest in contributing to this project!  
Please follow the guidelines below to keep the development workflow clean, stable, and consistent.

---

## 1. Branching Strategy

### Main Branch
- `main` is the stable, protected branch.
- Direct pushes to `main` are **not allowed**.

### Working Branches
Always create a new branch from `main`. Use the following naming conventions:
- `feature/feature-name`
- `fix/bug-name`
- `docs/doc-name`
- `refactor/module-name`

---

## 2. Git Workflow

1. Update your local `main`:  
   `git pull origin main`
2. Create a new branch:  
   `git checkout -b feature/my-feature`
3. Commit regularly with clear, meaningful messages  
   *(Conventional Commits recommended)*.
4. Push your branch:  
   `git push -u origin feature/my-feature`
5. Open a **Pull Request** targeting `main`.

---

## 3. Pull Request Guidelines

Each pull request must:
- Clearly describe the purpose of the change.
- Link related issues using: `Fixes #issue-number`.
- Contain a **single feature or fix** (no mixed changes).
- Pass all CI checks.
- Receive at least **one approval** from a reviewer.

---

## 4. Code Quality

Please ensure:
- Your code follows existing conventions (formatter, linter, architecture).
- New features include relevant tests.
- Documentation is updated when necessary.

---

## 5. Commit Style (Recommended)

Use Conventional Commits format:  
`type(scope): short message`

Examples:
- `feat(map): add dynamic zoom`
- `fix(api): resolve GeoJSON parsing error`
- `docs(readme): add installation instructions`

Allowed types:  
`feat`, `fix`, `refactor`, `docs`, `test`, `chore`

---

## 6. Communication

- Use GitHub Issues to discuss new ideas, report bugs, or ask questions.
- Be respectful and collaborative 😊

---

Thank you for contributing to this project!
