import SwiftUI

struct SignInView: View {
  @Environment(Session.self) private var session
  @State private var email = ""
  @State private var password = ""
  @State private var isWorking = false
  @State private var error: String?
  @FocusState private var focus: Field?

  private enum Field { case email, password }

  var body: some View {
    VStack(spacing: 28) {
      Spacer()
      VStack(spacing: 12) {
        Image("Mark")
          .resizable()
          .frame(width: 56, height: 56)
          .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
        Text("Stash")
          .font(.system(.largeTitle, design: .default).weight(.semibold))
          .foregroundStyle(Color.stashInk)
        Text(StashConfig.server.host() ?? "")
          .font(.stashDetail)
          .foregroundStyle(Color.stashMuted)
      }

      VStack(spacing: 10) {
        TextField("Email", text: $email)
          .textContentType(.username)
          .focused($focus, equals: .email)
          .onSubmit { focus = .password }
          #if os(iOS)
          .keyboardType(.emailAddress)
          .textInputAutocapitalization(.never)
          #endif
          .autocorrectionDisabled()
        SecureField("Password", text: $password)
          .textContentType(.password)
          .focused($focus, equals: .password)
          .onSubmit(signIn)
      }
      .textFieldStyle(StashFieldStyle())

      if let error {
        Text(error)
          .font(.callout)
          .foregroundStyle(Color.stashAccentText)
          .multilineTextAlignment(.center)
      }

      Button(action: signIn) {
        Group {
          if isWorking { ProgressView().controlSize(.small) } else { Text("Sign in") }
        }
        .frame(maxWidth: .infinity, minHeight: 22)
      }
      .buttonStyle(.borderedProminent)
      .controlSize(.large)
      .disabled(email.isEmpty || password.isEmpty || isWorking)
      .keyboardShortcut(.defaultAction)

      Spacer()
      Spacer()
    }
    .padding(24)
    .frame(maxWidth: 380)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Color.stashBackground)
    .onAppear { focus = .email }
  }

  private func signIn() {
    guard !email.isEmpty, !password.isEmpty, !isWorking else { return }
    isWorking = true
    error = nil
    Task {
      do {
        try await session.signIn(email: email.trimmingCharacters(in: .whitespaces), password: password)
      } catch {
        self.error = error.localizedDescription
      }
      isWorking = false
    }
  }
}

/// A plain field with a fine border, as on the web sign-in page.
struct StashFieldStyle: TextFieldStyle {
  func _body(configuration: TextField<Self._Label>) -> some View {
    configuration
      .textFieldStyle(.plain)
      .padding(.horizontal, 12)
      .padding(.vertical, 11)
      .background(Color.stashBackground, in: RoundedRectangle(cornerRadius: 8))
      .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.stashBorder))
  }
}
