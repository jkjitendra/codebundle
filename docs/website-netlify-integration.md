# Website And Netlify Integration

CodeBundle's download page should be available at:

```text
https://codebundle.jkjitendra.in
```

The download button should point to the latest GitHub Release:

```text
https://github.com/jkjitendra/codebundle/releases/latest
```

## Implemented Website Repo

The website repo is a Next.js app at:

```text
/Users/jk/Downloads/Projects/jitendra-portfolio
```

Codex can implement repository files such as the `/codebundle` route, static logo assets under `public/codebundle/`, and Netlify redirect rules in `netlify.toml`. Netlify dashboard and DNS changes still require manual access.

## Option A: Same Netlify Site As jkjitendra.in

Use this when `jkjitendra.in` and `www.jkjitendra.in` stay on the existing portfolio Netlify site.

Repository work:

1. Add a CodeBundle page or route in the website repo.
2. Add CodeBundle logo files to the website public assets.
3. Add a Netlify host rewrite so `codebundle.jkjitendra.in` serves the CodeBundle page.
4. Make the download button link to `https://github.com/jkjitendra/codebundle/releases/latest`.

Manual Netlify/DNS work:

1. Open Netlify dashboard.
2. Open the site connected to `jkjitendra.in`.
3. Go to Domain management.
4. Add `codebundle.jkjitendra.in`.
5. If DNS is external, create the DNS record Netlify asks for.
6. Redeploy the site.
7. Verify that `codebundle.jkjitendra.in` opens the CodeBundle landing page.
8. Verify the download button opens the latest GitHub Release.

## Option B: Separate Netlify Site

Use this if CodeBundle should have an isolated website deployment.

Repository work:

1. Create a small dedicated CodeBundle landing site.
2. Use `horizontal_logo.png` in the hero and `primary_logo.png` as the product visual.
3. Configure the download button to `https://github.com/jkjitendra/codebundle/releases/latest`.
4. Connect that repo to Netlify.

Manual Netlify/DNS work:

1. Open Netlify dashboard.
2. Create a new CodeBundle site.
3. Go to Domain management.
4. Add `codebundle.jkjitendra.in`.
5. If DNS is external, create the DNS record Netlify asks for.
6. Redeploy the site.
7. Verify that `codebundle.jkjitendra.in` opens the CodeBundle landing page.
8. Verify the download button opens the latest GitHub Release.

## Landing Page Content

The landing page should include:

- Headline: `CodeBundle`
- Subheadline: `Bundle selected project files into one AI-ready Markdown or TXT export.`
- Key points:
  - Local-first desktop app
  - No uploads
  - Built for developers
  - Excludes common secret/generated files by default
  - Bundled Python sidecar in packaged builds
- Buttons:
  - Download latest release
  - View GitHub repository

Do not hardcode private local file paths in the deployed website.
