import SwiftUI

/// Account sign-in rows, embedded in the Settings form's Account section.
/// Cookie-session auth only: email + password, no tokens are shown or stored
/// here. Signing in is for templates, preferences and consent — CV sessions
/// always stay local on this device.
struct LoginView: View {
    @EnvironmentObject private var auth: AuthModel
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        if auth.isSignedIn {
            LabeledContent("Signed in as", value: auth.accountLabel)
            Button("Sign out") { Task { await auth.logout() } }
                .disabled(auth.isBusy)
                .accessibilityLabel("Sign out")
        } else {
            TextField("Email", text: $email)
                .textContentType(.emailAddress)
                .autocorrectionDisabled()
                .accessibilityLabel("Email")
            SecureField("Password", text: $password)
                .accessibilityLabel("Password")
            if let error = auth.errorMessage {
                Text(error).font(.body).foregroundStyle(.red)
            }
            HStack {
                Button("Sign in") { Task { await auth.login(email: email, password: password) } }
                    .accessibilityLabel("Sign in")
                Button("Create account") { Task { await auth.register(email: email, password: password) } }
                    .accessibilityLabel("Create account")
            }
            .disabled(auth.isBusy || email.isEmpty || password.isEmpty)
            if auth.isBusy { ProgressView() }
            Text("Sign-in covers templates, preferences and consent. Your CV sessions stay on this device.")
                .font(.body).foregroundStyle(.secondary)
        }
    }
}
