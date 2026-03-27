process.env.TZ ||= "America/Sao_Paulo";
process.env.SCOPE_EXECUTE_AUTOMATION ||= "scope:test:execute";
process.env.SCOPE_SEND_LOGS ||= "scope:test:send";
process.env.SCOPE_READ_STATUS ||= "scope:test:read";
process.env.SCOPE_REGISTER_AGENT ||= "scope:test:register";

process.env.JWT_SECRET ||= "router-test-secret";
process.env.JWT_CALLBACK_ISSUER ||= "psc-sre-automacao-agent";
process.env.JWT_CALLBACK_AUDIENCE ||= "psc-sre-automacao-controller";
process.env.JWT_CALLBACK_MAX_TTL_SECONDS ||= "300";
process.env.JWT_ALGORITHMS ||= "HS256";
