# Security Policy

Two things already guard this repo on every push, per
[CONTRIBUTING.md](CONTRIBUTING.md): `npm audit --omit=dev` gates CI at zero
known-vulnerable dependencies, and CodeQL scans the code itself and reports to
this repo's Security tab — which matters here because the Worker runs two
OAuth flows and a pile of SQL where every security property is a `WHERE`
clause. This policy is for whatever those two miss.

## Supported versions

There's one line of development — `main`. No LTS or backport branches exist,
so a fix always lands there.

## Reporting a vulnerability

**Please don't open a public issue for anything exploitable.**

The preferred path is GitHub's private reporting: this repo's **Security**
tab → **Report a vulnerability**. That gets it to the maintainer without
putting the details somewhere anyone can read them first.

If that isn't workable for you, email **batalona06@gmail.com** directly.

Include what you'd want if you were on the other end: what you found, how to
reproduce it, and what you think the impact is (data exposure, auth bypass,
etc.).

## What to expect

This is one person's side project, maintained best-effort — there's no SLA.
A real report will get read and acted on; expect a reply, not a countdown
timer.
