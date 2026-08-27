# sw Android emulator node (golden image)

On-demand **real Android emulator** environments: the compute adapter
(`android-emulator`) creates a YC Compute VM from a prebaked golden image on a
**KVM-capable hardware platform**, and the VM self-configures from metadata into
a WebDriver node on `:4444`, exactly like every other environment.

This is the KVM sibling of `images/android-node` (redroid). Redroid is a
container on the host kernel; the **official QEMU emulator needs `/dev/kvm`**
(hardware acceleration), so it runs on a VM whose platform exposes nested
virtualization / bare metal. Everything else — the companion, the agent, the
lifecycle — is identical, and this boot infra runs on **any host that exposes
`/dev/kvm`**, not just YC.

## Flow

1. Client requests an Android environment with `execution=emulator` (and a
   version); routing resolves the project's `ProviderAccount{provider:
   "android-emulator"}` → this adapter.
2. The adapter runs `yc compute instance create` from `imageId` on
   `--platform-id <KVM platform>` with minimal resources (one emulator), passing
   metadata: `sw-environment-id`, `sw-android-avd` (`sw-android-<version>`),
   `sw-internal-url`, `sw-internal-token` (per-environment agent bearer token).
3. `sw-android-emulator-boot.service` runs `vm-boot.sh`: checks `/dev/kvm`,
   starts the AVD headless (KVM), fetches the agent, runs the companion (Appium
   + `/status` shim + nginx on `:4444`).
4. The agent's first heartbeat registers the environment (endpoint = the VM's
   private IP) → `executing`. Sessions are then allocated to it and proxied.
5. `DELETE` the environment → adapter deletes the VM.

## KVM platform (the one real prerequisite)

Standard YC Compute VMs do **not** expose nested virtualization; real KVM on YC
today means **bare metal** (a whole server, billed daily). The adapter does not
hardcode this — set `COMPUTE_ANDROID_EMULATOR_PLATFORM_ID` to whatever
KVM-capable platform is available (bare metal now; a minimal per-emulator VM
once nested virtualization or a cheaper per-minute KVM provider exists). The
billing granularity is a contract detail; the architecture is unchanged.

**De-risk before baking** — on the chosen platform confirm, in order:
`ls -l /dev/kvm` present · `emulator -avd sw-android-34 -no-window -accel on`
reaches `sys.boot_completed` · `adb shell` works · Appium creates a session ·
the companion answers `GET :4444/status`.

## Building the golden image

On a VM of the target KVM platform:

```bash
# Android SDK: cmdline-tools + emulator + platform-tools + a system image PER baked API level
sdkmanager "emulator" "platform-tools" \
    "system-images;android-34;google_apis;x86_64" \
    "system-images;android-33;google_apis;x86_64"

# One AVD per version, named sw-android-<version> (what vm-boot.sh boots)
avdmanager create avd -n sw-android-34 -k "system-images;android-34;google_apis;x86_64" -d pixel_6
avdmanager create avd -n sw-android-33 -k "system-images;android-33;google_apis;x86_64" -d pixel_6

# Companion (identical to the redroid node): Appium + node + nginx + the scripts
cp images/android-node/{start.sh,status-shim.js,nginx.conf} /opt/android-node/
npm i -g appium && appium driver install uiautomator2

# Boot infra
install -Dm755 images/android-emulator-node/vm-boot.sh /opt/android-emulator-node/vm-boot.sh
install -Dm644 images/android-emulator-node/sw-android-emulator-boot.service \
    /etc/systemd/system/sw-android-emulator-boot.service
systemctl enable sw-android-emulator-boot.service
```

Then snapshot the disk into a YC image and set its id as
`COMPUTE_ANDROID_EMULATOR_IMAGE_ID`.

**Baking all Android versions into one image does not scale** (each system image
is GBs); bake a small popular set and pin the AVD naming convention, as here.
Per-version pull-on-demand is a future option (smaller image, slower first boot).

## Config (install-level, `COMPUTE_ANDROID_EMULATOR_*`)

`IMAGE_ID`, `PLATFORM_ID` (KVM platform), `FOLDER_ID`, `ZONE`, `SUBNET_ID`,
`SECURITY_GROUP_ID`, `CORES`/`MEMORY_GB`/`DISK_GB` (one emulator),
`DEFAULT_VERSION`, `INTERNAL_URL`. The shared `INTERNAL_API_SECRET` authenticates
the agent.
