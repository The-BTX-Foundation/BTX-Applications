import UIKit
import LocalAuthentication

/// Native privacy lock for the BTX Ops Hub (adapted from Prism's). Covers the window whenever the app is not active, so the
/// app-switcher snapshot never shows applicant details, and asks for Face ID, with the device passcode as the fallback, on
/// cold launch and after 60 s or more in the background. No web code is involved.
///
/// The cover is drawn to the Figma frame "App lock (Face ID), phone" (BTX Apps file, node 465:11712).
final class PrivacyLock {
    static let shared = PrivacyLock()

    private let graceSeconds: TimeInterval = 60

    // BTX tokens (docs/DESIGN-DNA.md): bg, ink, muted, gold, gold-tint.
    private let bg = UIColor(red: 0xF4 / 255, green: 0xF5 / 255, blue: 0xF2 / 255, alpha: 1)
    private let ink = UIColor(red: 0x15 / 255, green: 0x17 / 255, blue: 0x1A / 255, alpha: 1)
    private let muted = UIColor(red: 0x54 / 255, green: 0x5A / 255, blue: 0x60 / 255, alpha: 1)
    private let gold = UIColor(red: 0xC9 / 255, green: 0x9B / 255, blue: 0x31 / 255, alpha: 1)
    private let goldTint = UIColor(red: 0xF6 / 255, green: 0xEE / 255, blue: 0xDA / 255, alpha: 1)

    private var cover: UIView?
    private var unlockButton: UIButton?
    private var backgroundedAt: Date?
    private var isColdLaunch = true
    private var isLocked = false          // cover is up and waiting on auth
    private var isAuthenticating = false  // a Face ID / passcode prompt is open

    func start() {
        let nc = NotificationCenter.default
        nc.addObserver(self, selector: #selector(willResignActive),
                       name: UIApplication.willResignActiveNotification, object: nil)
        nc.addObserver(self, selector: #selector(didEnterBackground),
                       name: UIApplication.didEnterBackgroundNotification, object: nil)
        nc.addObserver(self, selector: #selector(didBecomeActive),
                       name: UIApplication.didBecomeActiveNotification, object: nil)
        // Cover as soon as the first window exists, before any page can paint.
        nc.addObserver(self, selector: #selector(sceneConnected),
                       name: UIScene.willConnectNotification, object: nil)
    }

    @objc private func sceneConnected() {
        DispatchQueue.main.async { if self.isColdLaunch { self.showCover() } }
    }

    @objc private func willResignActive() {
        // Cover immediately so the snapshot iOS takes next is already opaque.
        showCover()
    }

    @objc private func didEnterBackground() {
        backgroundedAt = Date()
    }

    @objc private func didBecomeActive() {
        // The Face ID sheet itself resigns/becomes active; never stack prompts.
        if isAuthenticating { return }

        let away = backgroundedAt.map { Date().timeIntervalSince($0) }
        backgroundedAt = nil

        if isColdLaunch || (away ?? 0) >= graceSeconds {
            isColdLaunch = false
            isLocked = true
            showCover()
            authenticate()
        } else if !isLocked {
            hideCover()  // quick return: no prompt
        }
        // If already locked (failed or cancelled), stay covered until Unlock is tapped.
    }

    private func authenticate() {
        guard !isAuthenticating else { return }
        let context = LAContext()
        var error: NSError?
        // Deliberate: with no biometrics AND no passcode there is nothing to authenticate with. Don't lock the owner out.
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            unlock()
            return
        }
        isAuthenticating = true
        unlockButton?.isHidden = true
        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Unlock BTX Ops Hub") { success, error in
            if let error = error { NSLog("PrivacyLock: unlock failed: %@", error.localizedDescription) }
            DispatchQueue.main.async {
                self.isAuthenticating = false
                if success {
                    self.unlock()
                } else {
                    self.unlockButton?.isHidden = false  // stay covered, offer retry
                }
            }
        }
    }

    private func unlock() {
        isLocked = false
        hideCover()
    }

    // MARK: - Cover view

    private func keyWindow() -> UIWindow? {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow } ??
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }.first
    }

    private func showCover() {
        guard let window = keyWindow() else { return }
        // Drop the keyboard so its toolbar doesn't float over the cover.
        window.endEditing(true)
        if let cover = cover, cover.superview === window {
            cover.layer.removeAllAnimations()
            cover.alpha = 1
            window.bringSubviewToFront(cover)
            return
        }
        let view = buildCover(frame: window.bounds)
        window.addSubview(view)
        cover = view
    }

    private func buildCover(frame: CGRect) -> UIView {
        let view = UIView(frame: frame)
        view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.backgroundColor = bg

        // Logo, 118 x 52.
        let logo = UIImageView(image: UIImage(named: "BTXLogo"))
        logo.contentMode = .scaleAspectFit
        logo.isAccessibilityElement = true
        logo.accessibilityLabel = "BTX Foundation"
        logo.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            logo.widthAnchor.constraint(equalToConstant: 118),
            logo.heightAnchor.constraint(equalToConstant: 52),
        ])

        // Lock mark: a 64 pt gold-tint circle holding the Ops Hub's lock icon.
        let circle = UIView()
        circle.backgroundColor = goldTint
        circle.layer.cornerRadius = 32
        circle.translatesAutoresizingMaskIntoConstraints = false
        let mark = LockMarkView(color: ink)
        mark.translatesAutoresizingMaskIntoConstraints = false
        circle.addSubview(mark)
        NSLayoutConstraint.activate([
            circle.widthAnchor.constraint(equalToConstant: 64),
            circle.heightAnchor.constraint(equalToConstant: 64),
            mark.widthAnchor.constraint(equalToConstant: 28),
            mark.heightAnchor.constraint(equalToConstant: 28),
            mark.centerXAnchor.constraint(equalTo: circle.centerXAnchor),
            mark.centerYAnchor.constraint(equalTo: circle.centerYAnchor),
        ])

        let title = UILabel()
        title.text = "BTX Ops Hub is locked"
        title.font = .systemFont(ofSize: 26, weight: .medium)
        title.textColor = ink
        title.textAlignment = .center
        title.numberOfLines = 0
        title.adjustsFontForContentSizeCategory = true

        let line = UILabel()
        line.text = "It locks when you\u{2019}ve been away, so applicant details stay private."
        line.font = .systemFont(ofSize: 16, weight: .regular)
        line.textColor = muted
        line.textAlignment = .center
        line.numberOfLines = 0
        line.widthAnchor.constraint(lessThanOrEqualToConstant: 300).isActive = true

        let text = UIStackView(arrangedSubviews: [title, line])
        text.axis = .vertical
        text.alignment = .center
        text.spacing = 8

        let center = UIStackView(arrangedSubviews: [logo, circle, text])
        center.axis = .vertical
        center.alignment = .center
        center.spacing = 20
        center.setCustomSpacing(20, after: logo)
        center.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(center)

        // "Unlock with Face ID": the full-width gold button above the home indicator.
        let button = UIButton(type: .system)
        button.setTitle("Unlock with Face ID", for: .normal)
        button.titleLabel?.font = .systemFont(ofSize: 16, weight: .semibold)
        button.setTitleColor(ink, for: .normal)
        button.backgroundColor = gold
        button.isHidden = true
        button.translatesAutoresizingMaskIntoConstraints = false
        button.addTarget(self, action: #selector(unlockTapped), for: .touchUpInside)
        view.addSubview(button)
        unlockButton = button

        NSLayoutConstraint.activate([
            center.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            center.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            center.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 24),
            center.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -24),
            button.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            button.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
            button.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -16),
            button.heightAnchor.constraint(equalToConstant: 48),
        ])
        return view
    }

    private func hideCover() {
        guard let view = cover else { return }
        cover = nil
        unlockButton = nil
        UIView.animate(withDuration: 0.2, animations: { view.alpha = 0 }) { _ in
            view.removeFromSuperview()
        }
    }

    @objc private func unlockTapped() {
        authenticate()
    }
}

/// The Ops Hub's lock icon (components/icons.tsx, `lock`, drawn on a 20 x 20 grid), stroked at 1.6 and scaled to the view.
private final class LockMarkView: UIView {
    private let shape = CAShapeLayer()

    init(color: UIColor) {
        super.init(frame: .zero)
        isUserInteractionEnabled = false
        shape.fillColor = nil
        shape.strokeColor = color.cgColor
        shape.lineWidth = 1.6
        shape.lineCap = .round
        shape.lineJoin = .round
        layer.addSublayer(shape)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func layoutSubviews() {
        super.layoutSubviews()
        let s = min(bounds.width, bounds.height) / 20
        let body = UIBezierPath(roundedRect: CGRect(x: 4.5, y: 9, width: 11, height: 8), cornerRadius: 1.5)
        let shackle = UIBezierPath()
        shackle.move(to: CGPoint(x: 7, y: 9))
        shackle.addLine(to: CGPoint(x: 7, y: 6.5))
        shackle.addArc(withCenter: CGPoint(x: 10, y: 6.5), radius: 3, startAngle: .pi, endAngle: 0, clockwise: true)
        shackle.addLine(to: CGPoint(x: 13, y: 9))
        body.append(shackle)
        body.apply(CGAffineTransform(scaleX: s, y: s))
        shape.path = body.cgPath
        shape.lineWidth = 1.6 * s
        shape.frame = bounds
    }
}
