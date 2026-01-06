extern crate napi_build;

fn main() {
  napi_build::setup();

  // On Windows, libgit2 requires advapi32.lib for security/registry/crypto APIs
  // These symbols are needed by git2-rs even when using vendored builds
  #[cfg(windows)]
  {
    println!("cargo:rustc-link-lib=advapi32");
  }
}
