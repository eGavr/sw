// A platform names a concrete OS whose version field is honestly ITS version (`ubuntu 24.04`,
// `android 14`) — never a family word like "linux", which has no version of its own, and never a
// runtime artifact like an API level (34 is android 14's API, not its version). The W3C
// `platformName: linux` a session may send is a family alias resolved at the wd boundary, not a
// platform.
export enum PlatformName {
    Ubuntu = "ubuntu",
    Android = "android",
    Ios = "ios",
}
