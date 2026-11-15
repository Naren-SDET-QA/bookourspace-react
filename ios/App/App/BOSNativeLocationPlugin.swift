import Capacitor
import CoreLocation

@objc(BOSNativeLocationPlugin)
public final class BOSNativeLocationPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "BOSNativeLocationPlugin"
    public let jsName = "BOSNativeLocation"
    public let pluginMethods: [CAPPluginMethod] = [
        .init(name: "getCurrentPosition", returnType: CAPPluginReturnPromise)
    ]

    private let manager = CLLocationManager()
    private var pendingCall: CAPPluginCall?
    private var timeoutTask: DispatchWorkItem?

    override public func load() {
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        manager.distanceFilter = kCLDistanceFilterNone
    }

    @objc func getCurrentPosition(_ call: CAPPluginCall) {
        guard CLLocationManager.locationServicesEnabled() else {
            call.reject("Location services are disabled.", "OS-PLUG-GLOC-0001")
            return
        }
        guard pendingCall == nil else {
            call.reject("A location request is already in progress.", "BOS-LOCATION-BUSY")
            return
        }

        pendingCall = call
        bridge?.saveCall(call)
        let timeoutMs = max(1_000, min(call.getInt("timeout") ?? 30_000, 60_000))
        let timeout = DispatchWorkItem { [weak self] in
            self?.finishWithError("Could not obtain location in time.", code: "OS-PLUG-GLOC-0010")
        }
        timeoutTask = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(timeoutMs), execute: timeout)

        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            manager.startUpdatingLocation()
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .denied:
            finishWithError("Location permission was denied.", code: "OS-PLUG-GLOC-0003")
        case .restricted:
            finishWithError("Location permission is restricted.", code: "OS-PLUG-GLOC-0002")
        @unknown default:
            finishWithError("Location permission is unavailable.", code: "OS-PLUG-GLOC-0007")
        }
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard pendingCall != nil else { return }
        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            manager.startUpdatingLocation()
        case .denied:
            finishWithError("Location permission was denied.", code: "OS-PLUG-GLOC-0003")
        case .restricted:
            finishWithError("Location permission is restricted.", code: "OS-PLUG-GLOC-0002")
        case .notDetermined:
            break
        @unknown default:
            finishWithError("Location permission is unavailable.", code: "OS-PLUG-GLOC-0007")
        }
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard pendingCall != nil, let location = locations.last,
              location.horizontalAccuracy >= 0,
              abs(location.timestamp.timeIntervalSinceNow) <= 60 else { return }

        let result: JSObject = [
            "coords": [
                "latitude": location.coordinate.latitude,
                "longitude": location.coordinate.longitude,
                "accuracy": location.horizontalAccuracy
            ]
        ]
        finishWithSuccess(result)
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // Core Location can report a transient unavailable fix while it is still
        // acquiring. Keep updating until a valid fix arrives or our bounded timeout expires.
        if (error as? CLError)?.code == .denied {
            finishWithError("Location permission was denied.", code: "OS-PLUG-GLOC-0003")
        }
    }

    private func finishWithSuccess(_ result: JSObject) {
        guard let call = pendingCall else { return }
        cleanup()
        call.resolve(result)
        bridge?.releaseCall(call)
    }

    private func finishWithError(_ message: String, code: String) {
        guard let call = pendingCall else { return }
        cleanup()
        call.reject(message, code)
        bridge?.releaseCall(call)
    }

    private func cleanup() {
        timeoutTask?.cancel()
        timeoutTask = nil
        manager.stopUpdatingLocation()
        pendingCall = nil
    }
}
