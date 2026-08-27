// A Presenter renders a domain result into a transport (wire) representation. Its output — the plain
// object returned by present() — is the actual view model; the class is the mapper with behavior.
export interface Presenter {
    present(): object;
}
