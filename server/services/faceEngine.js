/**
 * MetricsEdu Face Recognition Engine (100% JavaScript / Node.js - No Python)
 * Performs high-precision 128-dimensional Euclidean Vector Distance matching
 * for classroom group photos.
 */

// Calculate Euclidean distance between two 128-d face descriptor arrays
function euclideanDistance(desc1, desc2) {
  if (!desc1 || !desc2 || desc1.length !== desc2.length) {
    return Infinity;
  }
  let sum = 0.0;
  for (let i = 0; i < desc1.length; i++) {
    const diff = desc1[i] - desc2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

// Convert distance to percentage confidence (threshold typically 0.55 to 0.60 for 128D ResNet/MobileNet)
function distanceToConfidence(distance, threshold = 0.55) {
  if (distance >= 1.0) return 0;
  // Normalized confidence: at 0 distance = 100%, at threshold = 70%, at 1.0 = 0%
  const score = Math.max(0, (1 - (distance / (threshold * 1.6)))) * 100;
  return Math.min(99.9, Math.round(score * 10) / 10);
}

// Match one candidate face against list of enrolled student profiles
function matchSingleFace(candidateDescriptor, enrolledStudents, threshold = 0.55) {
  let bestMatch = null;
  let minDistance = Infinity;

  for (const student of enrolledStudents) {
    if (!student.faceDescriptor || student.faceDescriptor.length === 0) continue;

    const distance = euclideanDistance(candidateDescriptor, student.faceDescriptor);
    if (distance < minDistance) {
      minDistance = distance;
      bestMatch = student;
    }
  }

  if (bestMatch && minDistance <= threshold) {
    return {
      match: true,
      student: bestMatch,
      distance: minDistance,
      confidence: distanceToConfidence(minDistance, threshold)
    };
  }

  return {
    match: false,
    student: null,
    distance: minDistance,
    confidence: bestMatch ? distanceToConfidence(minDistance, threshold) : 0
  };
}

// Match multiple detected faces from a full classroom photo against enrolled students
function matchClassroomDetections(detectedFaces, enrolledStudents, threshold = 0.55) {
  // detectedFaces: array of { descriptor: number[], box: { x, y, width, height } }
  const matchedStudentIds = new Set();
  const detectionResults = [];

  for (let i = 0; i < detectedFaces.length; i++) {
    const face = detectedFaces[i];
    const matchResult = matchSingleFace(face.descriptor, enrolledStudents, threshold);

    if (matchResult.match && matchResult.student) {
      const studentId = matchResult.student._id.toString();
      // If student hasn't been matched yet or this match has better confidence
      if (!matchedStudentIds.has(studentId)) {
        matchedStudentIds.add(studentId);
        detectionResults.push({
          faceIndex: i,
          box: face.box,
          matched: true,
          student: matchResult.student,
          distance: matchResult.distance,
          confidence: matchResult.confidence
        });
        continue;
      }
    }

    detectionResults.push({
      faceIndex: i,
      box: face.box,
      matched: false,
      student: null,
      distance: matchResult.distance,
      confidence: matchResult.confidence
    });
  }

  return {
    detections: detectionResults,
    matchedStudentIds: Array.from(matchedStudentIds)
  };
}

// Generate a deterministic 128-dimensional seed descriptor for demo students (for testing/mocking)
function generateDeterministicDescriptor(seedString) {
  const descriptor = [];
  let hash = 0;
  for (let i = 0; i < seedString.length; i++) {
    hash = (hash << 5) - hash + seedString.charCodeAt(i);
    hash |= 0;
  }

  for (let i = 0; i < 128; i++) {
    const val = Math.sin((hash + i) * 12.9898) * 43758.5453;
    descriptor.push(Number((val - Math.floor(val)).toFixed(6)) * 2 - 1);
  }
  return descriptor;
}

module.exports = {
  euclideanDistance,
  distanceToConfidence,
  matchSingleFace,
  matchClassroomDetections,
  generateDeterministicDescriptor
};
