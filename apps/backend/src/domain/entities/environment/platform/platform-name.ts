// A platform names a concrete OS whose version field is honestly ITS version (`ubuntu 24.04`,
// `android 14`) — never a family word like "linux", which has no version of its own. The W3C
// `platformName: linux` a session may send is a family alias resolved at the wd boundary, not a
// platform.
export enum PlatformName {
    Ubuntu = "ubuntu",
    Android = "android",
    Ios = "ios",
}
