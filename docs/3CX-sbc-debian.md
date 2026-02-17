# 3CX SBC on Debian/Raspberry Pi (Bookworm/Trixie Notes)

This document captures the exact steps used to get `3cxsbc` working on a Raspberry Pi running Debian-family Linux when the default install script fails.

Validated on: **2026-02-17**

## Problem Symptoms

Common failures we hit:

- `404 Not Found` for `trixie Release` from `http://repo.3cx.com/3cx`
- `sqv` signature errors on `bookworm`/`bookworm-testing` like:
  - `Signing key ... is not bound`
  - `SHA1 is not considered secure since 2026-02-01`
- `Unable to locate package 3cxsbc`

## Why This Happens

- 3CX repo did not provide a `trixie` release in our test path.
- Debian 13 (`trixie`) apt uses `sqv` by default, and it can reject older repository signing metadata.

## Working Fix

### 1. Remove broken/old 3CX apt list files

```bash
sudo rm -f /etc/apt/sources.list.d/3cxpbx.list /etc/apt/sources.list.d/3cxpbx-testing.list
```

### 2. Install 3CX keyring

```bash
wget -qO- http://repo.3cx.com/key.pub | gpg --dearmor | sudo tee /usr/share/keyrings/3cx-archive-keyring.gpg >/dev/null
```

### 3. Add Bookworm repos (main + testing)

```bash
echo "deb [arch=$(dpkg --print-architecture) by-hash=yes signed-by=/usr/share/keyrings/3cx-archive-keyring.gpg] http://repo.3cx.com/3cx bookworm main" | sudo tee /etc/apt/sources.list.d/3cxpbx.list
echo "deb [arch=$(dpkg --print-architecture) by-hash=yes signed-by=/usr/share/keyrings/3cx-archive-keyring.gpg] http://repo.3cx.com/3cx bookworm-testing main" | sudo tee /etc/apt/sources.list.d/3cxpbx-testing.list
```

### 4. Use `gpgv` for apt signature verification (workaround for `sqv` issue)

```bash
echo 'APT::Key::gpgvcommand "/usr/bin/gpgv";' | sudo tee /etc/apt/apt.conf.d/99-use-gpgv >/dev/null
```

### 5. Update apt and install SBC

```bash
sudo apt-get update
sudo apt-get install -y 3cxsbc
```

### 6. Ensure service is enabled and running

```bash
sudo systemctl enable 3cxsbc
sudo systemctl restart 3cxsbc
sudo systemctl status 3cxsbc --no-pager
```

## Provisioning/Reprovisioning

If install succeeds but you need to reprovision with your 3CX cloud URL + key:

1. Edit `/etc/3cxsbc.conf`:
- `PbxSipIP=<your-3cx-host>` (example: `1614.3cx.cloud`)
- `PbxSipPort=5060`
- `ProvLink=https://<your-3cx-host>/sbc/<your-auth-key>`

2. Reprovision:

```bash
sudo /usr/sbin/3cxsbc-reprovision
sudo systemctl restart 3cxsbc
```

## Verification Checklist

```bash
systemctl is-active 3cxsbc
systemctl is-enabled 3cxsbc
dpkg -l | grep 3cxsbc
```

Expected:
- service `active`
- service `enabled`
- package installed (for example `20.0.100`)

## Security Note

`/etc/apt/apt.conf.d/99-use-gpgv` is a compatibility workaround. Re-check 3CX repo signing behavior periodically and remove this override when upstream metadata is fully compatible with `sqv`.

