Pod::Spec.new do |s|
  s.name           = 'TitanCalls'
  s.version        = '1.0.0'
  s.summary        = 'Входящие «звонки» персоналу Titan HUB: VoIP-push (PushKit) и CallKit'
  s.description    = s.summary
  s.license        = 'UNLICENSED'
  s.author         = 'Titan'
  s.homepage       = 'https://titanpos.ru'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CallKit', 'PushKit'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
