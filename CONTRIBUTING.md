# Contributing to Open-Source Contribution Atelier

Thank you for your interest in contributing to **Open-Source Contribution Atelier**! 🚀

We welcome all kinds of contributions: code improvements, new features, bug fixes, UI/UX design, documentation, translations, and issue reports.

---

## ❄️ Contributing via NSoC '26 (Nexus Spring / Winter of Code)

We are thrilled to participate in **NSoC '26**! If you are participating as an NSoC contributor:

1. **Mandatory Issue Labels**:
   - Every eligible task must have the compulsory label: **`NSOC26`**
   - Difficulty tiers determining your points:
     - 🟢 **`LEVEL1` (10 Points)**: Beginner-friendly fixes, documentation polish, simple UI adjustments, test additions.
     - 🟡 **`LEVEL2` (25 Points)**: Feature enhancements, new components, API endpoint enhancements, bug fixes.
     - 🔴 **`LEVEL3` (50 Points)**: Architecture refactoring, complex full-stack features, security improvements, performance optimizations.

2. **Claiming an Issue**:
   - Find issues labeled [`NSOC26`](https://github.com/nandinigoyaldev/Open-Source-Contribution-Atelier/labels/NSOC26).
   - Comment `/claim` or `/assign` to be automatically assigned by our bot.
   - **48-Hour Inactivity Policy**: To ensure fair participation during the sprint, please submit a draft PR or progress update within **48 hours**. Issues inactive after **72 hours** will be automatically unassigned.
   - Maximum **5 active assigned issues** per contributor.

3. **Branch & Commit Conventions**:
   - Branch: `feat/nsoc-<issue-number>-<short-name>` or `fix/nsoc-...`
   - Commit message: `feat(nsoc): <short summary>` (e.g. `feat(nsoc): implement visual progress indicator`)

4. **Pull Request Submission**:
   - In your PR body, include **`Fixes #<issue-number>`**.
   - Ensure backend (`pytest`) and frontend (`npm test && npm run build`) checks pass locally.
   - Once merged, our bot awards your NSoC Contributor Certificate and adds your points to the [Hall of Fame Leaderboard](LEADERBOARD.md)!

---

## 🚀 Quick Start Guide

1. **Find an Issue**:
   - Check out issues tagged with [`NSOC26`](https://github.com/nandinigoyaldev/Open-Source-Contribution-Atelier/labels/NSOC26), [`good first issue`](https://github.com/nandinigoyaldev/Open-Source-Contribution-Atelier/labels/good%20first%20issue), or [`help wanted`](https://github.com/nandinigoyaldev/Open-Source-Contribution-Atelier/labels/help%20wanted).
   - Comment `/claim` or `/assign` on any unassigned issue to have our bot assign it to you.

2. **Set Up Locally**:
   ```bash
   # Clone your fork
   git clone https://github.com/<your-username>/Open-Source-Contribution-Atelier.git
   cd Open-Source-Contribution-Atelier

   # Copy environment templates
   make setup
   ```

3. **Frontend Development**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

4. **Backend Development**:
   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   python manage.py migrate
   python manage.py runserver
   ```

5. **Run Tests**:
   - Frontend: `npm test` (inside `frontend/`)
   - Backend: `pytest` (inside `backend/`)

6. **Submit a Pull Request**:
   - Create a feature branch: `git checkout -b feat/your-feature-name`
   - Commit your changes: `git commit -m "feat: add your feature"`
   - Push and open a PR linking the issue: `Fixes #<issue-number>`

---

## 📖 Comprehensive Guides

For detailed guides and deep dives, explore our documentation in [`docs/`](docs/):
- 📘 **[Full Contributing Guide](docs/CONTRIBUTING.md)**
- 🏛️ **[System Architecture](docs/ARCHITECTURE.md)**
- 🔑 **[Authentication & JWT Guide](docs/AUTHENTICATION.md)**
- 🌐 **[API Documentation](docs/API_GUIDE.md)**
- 🧪 **[Testing Guidelines](docs/testing/)**
- 🛡️ **[Security Policy](SECURITY.md)**
- 🤝 **[Code of Conduct](CODE_OF_CONDUCT.md)**

---

Thank you for building and learning with us! 🎉
