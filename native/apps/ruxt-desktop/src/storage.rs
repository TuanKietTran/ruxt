//! Local file storage for drafts/config. Names are bare file names only
//! (no separators / traversal); writes are atomic via temp file + rename.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct LocalStorage {
    root: PathBuf,
}

fn validate_name(name: &str) -> io::Result<()> {
    if name.is_empty() || name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("invalid storage name: {name}"),
        ));
    }
    Ok(())
}

impl LocalStorage {
    pub fn new(root: impl AsRef<Path>) -> Self {
        Self {
            root: root.as_ref().to_path_buf(),
        }
    }
    pub fn root(&self) -> &Path {
        &self.root
    }
    pub fn ensure(&self) -> io::Result<()> {
        fs::create_dir_all(&self.root)
    }
    pub fn write(&self, name: &str, contents: &str) -> io::Result<()> {
        validate_name(name)?;
        self.ensure()?;
        let tmp = self.root.join(format!(".{name}.tmp"));
        fs::write(&tmp, contents)?;
        fs::rename(&tmp, self.root.join(name))
    }
    pub fn read(&self, name: &str) -> io::Result<Option<String>> {
        validate_name(name)?;
        let path = self.root.join(name);
        if !path.exists() {
            return Ok(None);
        }
        Ok(Some(fs::read_to_string(path)?))
    }
    pub fn delete(&self, name: &str) -> io::Result<()> {
        validate_name(name)?;
        let path = self.root.join(name);
        if path.exists() {
            fs::remove_file(path)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn temp_root(tag: &str) -> PathBuf {
        std::env::temp_dir().join(format!("ruxt-desktop-test-{}-{tag}", std::process::id()))
    }
    #[test]
    fn write_read_delete_roundtrip() {
        let root = temp_root("rw");
        let store = LocalStorage::new(&root);
        store.write("draft.md", "# Hi").unwrap();
        assert_eq!(store.read("draft.md").unwrap().as_deref(), Some("# Hi"));
        assert_eq!(store.read("missing.md").unwrap(), None);
        store.delete("draft.md").unwrap();
        assert_eq!(store.read("draft.md").unwrap(), None);
        let _ = fs::remove_dir_all(&root);
    }
    #[test]
    fn rejects_traversal_and_separators() {
        let store = LocalStorage::new(temp_root("bad"));
        assert!(store.write("../evil", "x").is_err());
        assert!(store.write("a/b", "x").is_err());
        assert!(store.read("..\\evil").is_err());
    }
    #[test]
    fn overwrite_replaces_atomically() {
        let root = temp_root("overwrite");
        let store = LocalStorage::new(&root);
        store.write("a.txt", "one").unwrap();
        store.write("a.txt", "two").unwrap();
        assert_eq!(store.read("a.txt").unwrap().as_deref(), Some("two"));
        let _ = fs::remove_dir_all(&root);
    }
}
