//! Minimal, safe Markdown -> HTML rendering for the CV preview.
//! Raw HTML in the source is always escaped; only the constructs
//! generated here (headings, paragraphs, lists, strong/em/code) are tags.

pub fn escape_html(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for c in input.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            _ => out.push(c),
        }
    }
    out
}

pub fn render_inline(input: &str) -> String {
    let chars: Vec<char> = input.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '*' && i + 1 < chars.len() && chars[i + 1] == '*' {
            if let Some(end) = find_pair(&chars, i + 2, "**") {
                out.push_str("<strong>");
                out.push_str(&escape_html(&chars[i + 2..end].iter().collect::<String>()));
                out.push_str("</strong>");
                i = end + 2;
                continue;
            }
        }
        if chars[i] == '*' || chars[i] == '_' {
            let marker = chars[i];
            if let Some(end) = find_char(&chars, i + 1, marker) {
                out.push_str("<em>");
                out.push_str(&escape_html(&chars[i + 1..end].iter().collect::<String>()));
                out.push_str("</em>");
                i = end + 1;
                continue;
            }
        }
        if chars[i] == '`' {
            if let Some(end) = find_char(&chars, i + 1, '`') {
                out.push_str("<code>");
                out.push_str(&escape_html(&chars[i + 1..end].iter().collect::<String>()));
                out.push_str("</code>");
                i = end + 1;
                continue;
            }
        }
        let mut buf = String::new();
        buf.push(chars[i]);
        out.push_str(&escape_html(&buf));
        i += 1;
    }
    out
}

fn find_char(chars: &[char], from: usize, target: char) -> Option<usize> {
    (from..chars.len()).find(|&j| chars[j] == target)
}

fn find_pair(chars: &[char], from: usize, pair: &str) -> Option<usize> {
    let p: Vec<char> = pair.chars().collect();
    if chars.len() < from + p.len() { return None; }
    (from..=chars.len() - p.len()).find(|&j| chars[j..j + p.len()] == p[..])
}

pub fn render_markdown(input: &str) -> String {
    let mut out = String::new();
    let mut in_list = false;
    for line in input.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("- ") || trimmed.starts_with("* ") {
            if !in_list { out.push_str("<ul>"); in_list = true; }
            out.push_str("<li>");
            out.push_str(&render_inline(&trimmed[2..]));
            out.push_str("</li>");
            continue;
        }
        if in_list { out.push_str("</ul>"); in_list = false; }
        if trimmed.is_empty() { continue; }
        if let Some(rest) = trimmed.strip_prefix("### ") {
            out.push_str("<h3>"); out.push_str(&render_inline(rest)); out.push_str("</h3>");
        } else if let Some(rest) = trimmed.strip_prefix("## ") {
            out.push_str("<h2>"); out.push_str(&render_inline(rest)); out.push_str("</h2>");
        } else if let Some(rest) = trimmed.strip_prefix("# ") {
            out.push_str("<h1>"); out.push_str(&render_inline(rest)); out.push_str("</h1>");
        } else {
            out.push_str("<p>"); out.push_str(&render_inline(trimmed)); out.push_str("</p>");
        }
    }
    if in_list { out.push_str("</ul>"); }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn heading_and_paragraph() {
        assert_eq!(render_markdown("# Title\n\nHello"), "<h1>Title</h1><p>Hello</p>");
    }
    #[test] fn bold_code_and_list() {
        assert_eq!(render_markdown("- **a**\n- `b`"), "<ul><li><strong>a</strong></li><li><code>b</code></li></ul>");
    }
    #[test] fn raw_html_is_escaped() {
        assert_eq!(render_markdown("<script>x</script>"), "<p>&lt;script&gt;x&lt;/script&gt;</p>");
    }
    #[test] fn unmatched_markers_stay_literal() {
        assert_eq!(render_inline("a * b"), "a * b");
    }
}
