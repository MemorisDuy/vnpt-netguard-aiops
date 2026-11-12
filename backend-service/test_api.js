// ==============================================================================
// TẬP LỆNH KIỂM THỬ TỰ ĐỘNG (AUTOMATED TEST SUITE) CHO BACKEND SERVICE
// Đề tài N3.2: Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
// Phụ trách: Nguyễn Ngọc Duy (Tech Lead & Core Developer)
// ==============================================================================

const http = require('http');
const app = require('./server');

const TEST_PORT = 5055;
let server;

// Hàm gửi request HTTP tiện ích phục vụ kiểm thử
function sendRequest(options, postData = null) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                let parsed = null;
                try {
                    parsed = JSON.parse(data);
                } catch {
                    parsed = data;
                }
                resolve({ statusCode: res.statusCode, body: parsed });
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        if (postData) {
            req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
        }
        req.end();
    });
}

async function runTests() {
    console.log('[BAT DAU KIEM THU TU DONG BACKEND API]');
    console.log('----------------------------------------------------');

    let totalTests = 0;
    let passedTests = 0;

    function assert(condition, testName) {
        totalTests++;
        if (condition) {
            passedTests++;
            console.log(`[PASS] Test ${totalTests}: ${testName}`);
        } else {
            console.error(`[FAIL] Test ${totalTests}: ${testName}`);
        }
    }

    // Khởi động server test trên cổng riêng
    server = app.listen(TEST_PORT);

    try {
        // Test 1: Kiểm tra route Health Check
        const res1 = await sendRequest({
            hostname: 'localhost',
            port: TEST_PORT,
            path: '/api/health',
            method: 'GET'
        });
        assert(res1.statusCode === 200 && res1.body.status === 'success', 'GET /api/health tra ve status 200 va success');

        // Test 2: Dự báo rủi ro an toàn (KPI binh thuong)
        const normalKpi = {
            latency_ms: 18.5,
            packet_loss_rate: 0.2,
            jitter_ms: 2.1,
            throughput_mbps: 115.0
        };
        const res2 = await sendRequest({
            hostname: 'localhost',
            port: TEST_PORT,
            path: '/api/analytics/predict-risk',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, normalKpi);
        assert(
            res2.statusCode === 200 &&
            res2.body.status === 'success' &&
            res2.body.prediction.risk_level === 'LOW',
            'POST /api/analytics/predict-risk voi KPI tot du bao muc LOW (An toan)'
        );

        // Test 3: Dự báo rủi ro cao (KPI suy giam nang)
        const highRiskKpi = {
            latency_ms: 85.0,
            packet_loss_rate: 6.5,
            jitter_ms: 19.2,
            throughput_mbps: 14.0
        };
        const res3 = await sendRequest({
            hostname: 'localhost',
            port: TEST_PORT,
            path: '/api/analytics/predict-risk',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, highRiskKpi);
        assert(
            res3.statusCode === 200 &&
            res3.body.status === 'success' &&
            res3.body.prediction.is_anomaly === true &&
            res3.body.prediction.risk_level === 'HIGH',
            'POST /api/analytics/predict-risk voi KPI kem du bao muc HIGH (Nguy co suy giam cao)'
        );

        // Test 4: Kiểm tra bắt lỗi khi thiếu chỉ số KPI đầu vào
        const missingKpi = {
            latency_ms: 25.0
        };
        const res4 = await sendRequest({
            hostname: 'localhost',
            port: TEST_PORT,
            path: '/api/analytics/predict-risk',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, missingKpi);
        assert(
            res4.statusCode === 400 &&
            res4.body.status === 'error',
            'POST /api/analytics/predict-risk bat loi 400 khi thieu tham so KPI'
        );

        // Test 5: Kiểm tra bắt lỗi khi giá trị KPI ngoài phạm vi hợp lệ
        const invalidKpi = {
            latency_ms: -10,
            packet_loss_rate: 150,
            jitter_ms: -2,
            throughput_mbps: -50
        };
        const res5 = await sendRequest({
            hostname: 'localhost',
            port: TEST_PORT,
            path: '/api/analytics/predict-risk',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, invalidKpi);
        assert(
            res5.statusCode === 400 &&
            res5.body.status === 'error',
            'POST /api/analytics/predict-risk bat loi 400 khi gia tri KPI ngoai bien cho phep'
        );

        // Test 6: Kiểm tra xác thực tham số tọa độ nearby
        const res6 = await sendRequest({
            hostname: 'localhost',
            port: TEST_PORT,
            path: '/api/analytics/nearby',
            method: 'GET'
        });
        assert(
            res6.statusCode === 400 &&
            res6.body.status === 'error',
            'GET /api/analytics/nearby bat loi 400 khi thieu lat va lng'
        );

    } catch (err) {
        console.error('[LOI TRONG QUA TRINH TEST]:', err.message);
    } finally {
        server.close();
        console.log('----------------------------------------------------');
        console.log(`[KET QUA]: ${passedTests}/${totalTests} tests da vuot qua thanh cong!`);
        if (passedTests === totalTests && totalTests > 0) {
            console.log('[DANH GIA]: TOAN BO KIEM THU BACKEND DAT CHUAN 100%');
            process.exit(0);
        } else {
            console.error('[DANH GIA]: CO TEST THAT BAI!');
            process.exit(1);
        }
    }
}

runTests();
